/**
 * Nettiauto Financing Analyser — content.js (v2)
 * Runs on nettiauto.com pages.
 * - Listing pages: inject full deal analysis panel
 * - Search pages: inject mini cost badges on result cards
 */

(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────────────────────
  // Globals
  // ────────────────────────────────────────────────────────────────────────────

  let searchObserver = null;
  let searchRaf = 0;
  let urlObserver = null;
  let lastUrl = location.href;

  // ────────────────────────────────────────────────────────────────────────────
  // Utilities
  // ────────────────────────────────────────────────────────────────────────────

  function extractNumber(text) {
    if (!text) return null;
    const raw = String(text)
      .replace(/\u00a0/g, ' ')
      .replace(/[€%]/g, '')
      .replace(/[^\d,\.\- ]/g, '')
      .trim()
      .replace(/\s+/g, '');

    if (!raw) return null;

    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');

    let normalized = raw;
    if (lastComma > lastDot) {
      // Finnish style: 17.890,50 -> 17890.50
      normalized = raw.replace(/\./g, '').replace(',', '.');
    } else if (lastDot > lastComma) {
      // EN style: 17,890.50 -> 17890.50
      normalized = raw.replace(/,/g, '');
    } else {
      // Single separator or none: remove likely thousands separators only.
      normalized = raw.replace(/[.,](?=\d{3}\b)/g, '');
    }

    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }

  function formatEur(val, decimals = 0) {
    if (val == null || !Number.isFinite(val)) return '—';
    return '€' + val.toLocaleString('fi-FI', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function formatPct(val) {
    if (val == null || !Number.isFinite(val)) return '—';
    return (val * 100).toFixed(2) + '%';
  }

  function safeText(root = document) {
    return (root.innerText || '').replace(/\u00a0/g, ' ');
  }

  function removeExistingPanel() {
    document.getElementById('ads-panel')?.remove();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Finance Math
  // ────────────────────────────────────────────────────────────────────────────

  function computeDeal({
    price,
    downPayment = 0,
    termMonths = 60,
    nominalRatePct = 4.0,
    monthlyFee = 0,
    openingFee = 0,
    balloon = 0,
    monthlyPaymentGiven = null,
    openingFeeFinanced = false
  }) {
    const principal = price - downPayment;
    if (!Number.isFinite(principal) || principal <= 0 || termMonths <= 0) return null;

    const financedPrincipal = openingFeeFinanced ? principal + openingFee : principal;
    const monthlyRate = nominalRatePct / 100 / 12;

    let monthlyPayment;

    if (monthlyPaymentGiven && monthlyPaymentGiven > 0) {
      // Guard against teaser-like monthly values while allowing balloon-heavy structures.
      const minAmortized = Math.max((financedPrincipal - (balloon || 0)) / termMonths, 0);
      const minRequired = minAmortized * 0.9;
      if (monthlyPaymentGiven >= minRequired) {
        monthlyPayment = monthlyPaymentGiven;
      }
    }

    if (!monthlyPayment) {
      if (monthlyRate === 0) {
        monthlyPayment = balloon > 0
          ? (financedPrincipal - balloon) / termMonths
          : financedPrincipal / termMonths;
      } else {
        const pvBalloon = balloon > 0 ? balloon / Math.pow(1 + monthlyRate, termMonths) : 0;
        const adjPrincipal = financedPrincipal - pvBalloon;

        if (adjPrincipal <= 0) return null;

        monthlyPayment =
          adjPrincipal *
          (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
          (Math.pow(1 + monthlyRate, termMonths) - 1);
      }
    }

    const totalMonthlyWithFee = monthlyPayment + monthlyFee;
    const upfrontOpeningFee = openingFeeFinanced ? 0 : openingFee;
    const totalPaid = downPayment + upfrontOpeningFee + totalMonthlyWithFee * termMonths + balloon;
    const totalFinanceCost = totalPaid - price;

    const apr = solveEffectiveAPR({
      principal,
      monthlyPayment,
      monthlyFee,
      termMonths,
      balloon,
      openingFee,
      openingFeeFinanced
    });

    return {
      principal,
      monthlyPayment,
      totalMonthlyWithFee,
      totalPaid,
      totalFinanceCost,
      apr
    };
  }

  function solveEffectiveAPR({
    principal,
    monthlyPayment,
    monthlyFee,
    termMonths,
    balloon = 0,
    openingFee = 0,
    openingFeeFinanced = false
  }) {
    const netAdvance = openingFeeFinanced ? principal : (principal - openingFee);
    const payment = monthlyPayment + monthlyFee;

    if (!Number.isFinite(netAdvance) || netAdvance <= 0) return null;
    if (!Number.isFinite(payment) || payment < 0) return null;

    function npv(r) {
      let pvOutflows = 0;
      for (let t = 1; t <= termMonths; t++) {
        pvOutflows += payment / Math.pow(1 + r, t);
      }
      if (balloon > 0) {
        pvOutflows += balloon / Math.pow(1 + r, termMonths);
      }
      return pvOutflows - netAdvance;
    }

    let low = 0;
    let high = 0.1;
    let fLow = npv(low);
    let fHigh = npv(high);

    // If total undiscounted outflows are below net advance, no non-negative IRR exists.
    if (fLow < 0) return null;

    let expansions = 0;
    while (fLow * fHigh > 0 && expansions < 10) {
      high *= 2;
      fHigh = npv(high);
      expansions++;
    }

    if (fLow * fHigh > 0) return null;

    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2;
      const fMid = npv(mid);

      if (Math.abs(fMid) < 1e-8) {
        return Math.pow(1 + mid, 12) - 1;
      }

      if (fLow * fMid <= 0) {
        high = mid;
        fHigh = fMid;
      } else {
        low = mid;
        fLow = fMid;
      }
    }

    const monthlyIrr = (low + high) / 2;
    return Math.pow(1 + monthlyIrr, 12) - 1;
  }

  function getVerdict(totalFinanceCost, price, apr = null, termMonths = null) {
    const ratio = price > 0 ? totalFinanceCost / price : 0;

    // Prefer effective APR bands when available.
    if (apr != null && Number.isFinite(apr) && apr >= 0) {
      const aprPct = apr * 100;

      if (aprPct < 6.0) return { label: 'Erinomainen', color: '#22c55e', bg: '#052e16' };
      if (aprPct < 9.0) {
        // Long terms make moderate APRs more expensive in total terms.
        if (termMonths != null && termMonths >= 84 && aprPct >= 8.0) {
          return { label: 'Kohtalainen', color: '#f59e0b', bg: '#1c1000' };
        }
        return { label: 'Hyvä', color: '#60a5fa', bg: '#0c1a2e' };
      }
      if (aprPct < 13.0) return { label: 'Kohtalainen', color: '#f59e0b', bg: '#1c1000' };
      return { label: 'Kallis', color: '#ef4444', bg: '#1c0000' };
    }

    // Fallback when APR cannot be computed.
    if (ratio < 0.08) return { label: 'Erinomainen', color: '#22c55e', bg: '#052e16' };
    if (ratio < 0.15) return { label: 'Hyvä', color: '#60a5fa', bg: '#0c1a2e' };
    if (ratio < 0.25) return { label: 'Kohtalainen', color: '#f59e0b', bg: '#1c1000' };
    return { label: 'Kallis', color: '#ef4444', bg: '#1c0000' };
  }

  function getConfidence(data) {
    let score = 0;
    const reasons = [];

    if (data.price) score += 3; else reasons.push('hinta puuttuu');
    if (data.monthlyPaymentGiven) score += 3; else reasons.push('kuukausierä puuttuu');
    if (data.nominalRatePct != null) score += 2; else reasons.push('korko puuttuu');
    if (data.termMonths) score += 2; else reasons.push('laina-aika puuttuu');
    if (data.balloon > 0) score += 1;
    if (data.monthlyFee > 0) score += 1;
    if (data.openingFee > 0) score += 1;

    if (data.monthlyPaymentGiven && data.nominalRatePct == null && data.balloon === 0 && data.monthlyFee === 0 && data.openingFee === 0) {
      reasons.push('kuukausierä löytyi mutta rahoitusehdot puutteelliset');
      return { level: 'low', labelFi: 'Heikko varmuus', color: '#ef4444', bg: '#1c0000', reasons };
    }

    if (score >= 9) return { level: 'exact', labelFi: 'Tarkka', color: '#22c55e', bg: '#052e16', reasons };
    if (score >= 6) return { level: 'estimate', labelFi: 'Arvio', color: '#f59e0b', bg: '#1c1000', reasons };
    return { level: 'low', labelFi: 'Heikko varmuus', color: '#ef4444', bg: '#1c0000', reasons };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Parsing
  // ────────────────────────────────────────────────────────────────────────────

  function extractJsonLdPrice() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      try {
        const parsed = JSON.parse(s.textContent);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (item?.offers?.price) {
            const p = extractNumber(String(item.offers.price));
            if (Number.isFinite(p)) return p;
          }
        }
      } catch {}
    }
    return null;
  }

  function firstText(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const val = (el.value || el.textContent || '').trim();
      if (val) return val;
    }
    return null;
  }

  function parseListingPage() {
    const clone = document.body.cloneNode(true);
    clone.querySelector('#ads-panel')?.remove();
    clone.querySelectorAll('[id^="ads-"], [class^="ads-"]').forEach(el => el.remove());
    const text = safeText(clone);

    // ── Price — confirmed selector
    let price = extractNumber(firstText([
      '.details-page-header__item-price-main',
      '[data-testid="price"]',
      '[class*="price-main"]'
    ]));
    if (!price) price = extractJsonLdPrice();
    if (!price) {
      const metaPrice = document.querySelector('meta[property="product:price:amount"]');
      if (metaPrice) { const p = parseFloat(metaPrice.content); if (Number.isFinite(p)) price = p; }
    }
    if (!price) {
      const titleMatch = document.title.match(/([\d][\d\s,]{2,8})\s*€/);
      if (titleMatch) price = extractNumber(titleMatch[1]);
    }

    // ── Interest rate — OP widget is the only reliable source on Nettiauto
    // Dealer's own rate is not shown on the listing page
    let nominalRatePct = null;
    const opRateText = firstText([
      '#opd_mir',
      '[id*="mir"]',
      '[data-testid*="interest"]',
      '[aria-label*="korko" i]'
    ]);
    const opRateVal = extractNumber(opRateText);
    if (opRateVal && opRateVal > 0 && opRateVal < 30) nominalRatePct = opRateVal;
    // Fallback: text patterns for dealers who do show their rate
    if (!nominalRatePct) {
      const rateMatch = text.match(/[Nn]imelliskorko[:\s]*([\d,.]+)\s*%/)
        || text.match(/[Rr]ahoituskorko[:\s]*([\d,.]+)\s*%/)
        || text.match(/([\d,.]+)\s*%\s*korko/i);
      if (rateMatch) nominalRatePct = extractNumber(rateMatch[1]);
    }

    // ── Term — OP widget selected value
    let term = 60;
    const opPeriodText = firstText([
      '#opdLoanPeriod',
      'select[name*="period" i] option:checked',
      '[data-testid*="loan-period"]'
    ]);
    const t = parseInt(opPeriodText, 10);
    if (t >= 12 && t <= 96) term = t;

    // ── Monthly payment
    // "alk. X €/kk" is always a teaser — NEVER use it
    // Only use explicitly labelled kuukausierä from dealer
    let monthly = null;
    const monthlyPatterns = [
      /[Kk]uukausier[äa][:\s]*([\d\s,]+)\s*€(?!\s*\/\s*kk\s*alk)/i,
      /[Vv]ähimmäiserä[:\s]*([\d\s,]+)\s*€/i,
    ];
    for (const pat of monthlyPatterns) {
      const m = text.match(pat);
      if (m) {
        const val = extractNumber(m[1]);
        if (val && val >= 50 && val <= 5000) { monthly = val; break; }
      }
    }

    // ── Toimistomaksu — confirmed DOM selector
    let toimistomaksu = 0;
    for (const box of document.querySelectorAll('.vehicle-info-box')) {
      const label = box.querySelector('.vehicle-info-box__vehicle-info')?.innerText || '';
      if (/toimisto|office\.fee|k[äa]sittely|hallinto|document/i.test(label)) {
        const valEl = box.querySelector('.vehicle-info-box__vehicle-det');
        if (valEl) {
          const val = extractNumber(valEl.innerText);
          if (val && val > 0) { toimistomaksu = val; break; }
        }
      }
    }

    // ── Opening fee (avausmaksu — text fallback)
    let openingFeeBase = 0;
    const openMatch = text.match(/(?:avausmaksu|aloitusmaksu|j[äa]rjestelymaksu)[:\s]*([\d\s,.]+)\s*€/i);
    if (openMatch) openingFeeBase = extractNumber(openMatch[1]) || 0;

    const combinedFeeHint = /avausmaksu.*toimistomaksu|sis\.?\s*toimistomaksu/i.test(text);
    const openingFee = combinedFeeHint
      ? Math.max(openingFeeBase, toimistomaksu)
      : (openingFeeBase + toimistomaksu);

    // ── Monthly fee (hoitomaksu — recurring, text fallback)
    let monthlyFee = 0;
    const feeMatch = text.match(/(?:hoitomaksu|tilinhoitomaksu)[:\s]*([\d,.]+)\s*€/i);
    if (feeMatch) monthlyFee = extractNumber(feeMatch[1]) || 0;

    // ── Balloon
    let balloon = 0;
    const balloonMatch = text.match(/(?:j[äa]{2}nn[oö]sarvo|loppuer[äa])[:\s]*([\d\s,.]+)\s*€/i);
    if (balloonMatch) balloon = extractNumber(balloonMatch[1]) || 0;

    // ── Down payment
    let downPayment = 0;
    const downMatch = text.match(/k[äa]siraha[:\s]*([\d\s,.]+)\s*€/i);
    if (downMatch) downPayment = extractNumber(downMatch[1]) || 0;

    const h1 = document.querySelector('h1');
    const name = h1 ? h1.innerText.trim() : document.title;

    return {
      name, price, downPayment,
      termMonths: term, nominalRatePct,
      monthlyFee, openingFee, toimistomaksu, balloon,
      monthlyPaymentGiven: monthly,
      openingFeeFinanced: false
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Page detection
  // ────────────────────────────────────────────────────────────────────────────

  function isListingPage() {
    return /nettiauto\.com\/[^/]+\/[^/]+\/\d+/.test(location.href)
      || /nettiauto\.com\/auto\//.test(location.href);
  }

  function isSearchPage() {
    if (isListingPage()) return false;
    if (location.search.length > 0) return true;
    return !!document.querySelector([
      '.car-list-item', '.listing-item', '.result-item',
      '[class*="car-item"]', '[class*="listing-card"]'
    ].join(','));
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Panel injection
  // ────────────────────────────────────────────────────────────────────────────

  function injectPanel(data) {
    removeExistingPanel();

    const panel = document.createElement('div');
    panel.id = 'ads-panel';

    // Mutable state for user overrides
    const state = {
      nominalRatePct: data.nominalRatePct ?? 4.0,
      monthlyPaymentGiven: data.monthlyPaymentGiven ?? null,
      rateFromPage: data.nominalRatePct != null,
      monthlyFromPage: data.monthlyPaymentGiven != null,
    };

    async function loadSavedOverrides() {
      try {
        const result = await chrome.storage.local.get("userOverrides");
        if (result.userOverrides) {
          const { nominalRatePct, monthlyPaymentGiven, savedAt } = result.userOverrides;
          const now = Date.now();
          const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

          if (now - savedAt < sevenDaysMs) {
            // Task 4 Fix: Only update if the specific field exists in storage to avoid wiping defaults
            if (nominalRatePct !== undefined) {
              state.nominalRatePct = nominalRatePct;
              state.rateFromPage = false;
              const rateInput = panel.querySelector('#ads-rate-input');
              if (rateInput) rateInput.value = nominalRatePct.toFixed(2);
            }
            
            if (monthlyPaymentGiven !== undefined) {
              state.monthlyPaymentGiven = monthlyPaymentGiven;
              state.monthlyFromPage = false;
              const monthlyInput = panel.querySelector('#ads-monthly-input');
              if (monthlyInput) monthlyInput.value = monthlyPaymentGiven.toFixed(2);
            }
          }
        }
      } catch (e) { /* Silently catch storage errors */ }
    }

    function renderPanel() {
      const currentData = {
        ...data,
        nominalRatePct: state.nominalRatePct,
        monthlyPaymentGiven: state.monthlyPaymentGiven,
      };

      const currentDeal = computeDeal({
        price: currentData.price,
        downPayment: currentData.downPayment,
        termMonths: currentData.termMonths || 60,
        nominalRatePct: state.nominalRatePct,
        monthlyFee: currentData.monthlyFee || 0,
        openingFee: currentData.openingFee || 0,
        balloon: currentData.balloon || 0,
        monthlyPaymentGiven: state.monthlyPaymentGiven,
        openingFeeFinanced: currentData.openingFeeFinanced
      });

      if (!currentDeal) return;

      const verdict = getVerdict(
        currentDeal.totalFinanceCost,
        currentData.price,
        currentDeal.apr,
        currentData.termMonths
      );
      const confidence = getConfidence(currentData);

      const warnings = [];
      if (!state.rateFromPage && state.nominalRatePct === 4.0) {
        warnings.push('Korko ei löytynyt — käytetään oletusta 4%. Tarkista arvo alla.');
      } else if (!state.rateFromPage && state.nominalRatePct > 0) {
        warnings.push(`Korko perustuu OP:n rahoituslaskuriin (${state.nominalRatePct.toFixed(2)}%). Tarkista tai korjaa alla.`);
      }

      const wasCollapsed = panel.querySelector('#ads-body')?.style.display === 'none';

      panel.innerHTML = `
        <div class="ads-header">
          <div class="ads-logo">
            <span class="ads-logo-icon">🔍</span>
            <span class="ads-logo-text">Nettiauto Financing Analyser</span>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <div class="ads-confidence" style="background:${confidence.bg}; color:${confidence.color};">${confidence.labelFi}</div>
            <div class="ads-verdict" style="background:${verdict.bg}; color:${verdict.color};">${verdict.label}</div>
            <button class="ads-toggle" id="ads-toggle-btn">▲</button>
          </div>
        </div>

        <div class="ads-body" id="ads-body" style="display:${wasCollapsed ? 'none' : 'block'}">

          <div class="ads-grid">
            <div class="ads-stat">
              <div class="ads-stat-label">Listahinta</div>
              <div class="ads-stat-value">${formatEur(currentData.price, 0)}</div>
            </div>
            <div class="ads-stat ads-stat-highlight">
              <div class="ads-stat-label">Maksat yhteensä</div>
              <div class="ads-stat-value" style="color:#ef4444">${formatEur(currentDeal.totalPaid, 2)}</div>
            </div>
            <div class="ads-stat">
              <div class="ads-stat-label">Rahoituksen kulut</div>
              <div class="ads-stat-value" style="color:#f59e0b">${formatEur(currentDeal.totalFinanceCost, 2)}</div>
            </div>
            <div class="ads-stat">
              <div class="ads-stat-label">Kuukausierä + kulut</div>
              <div class="ads-stat-value" style="color:#60a5fa">${formatEur(currentDeal.totalMonthlyWithFee, 2)}</div>
            </div>
            <div class="ads-stat">
              <div class="ads-stat-label">Tod. vuosikorko</div>
              <div class="ads-stat-value" style="color:#a78bfa">${formatPct(currentDeal.apr)}</div>
            </div>
            <div class="ads-stat">
              <div class="ads-stat-label">Laina-aika</div>
              <div class="ads-stat-value">${currentData.termMonths} kk</div>
            </div>
          </div>

          <div class="ads-divider"></div>

          <div class="ads-details">
            <div class="ads-detail-row">
              <span class="ads-detail-label">Rahoitettava osuus</span>
              <span class="ads-detail-value">${formatEur(currentDeal.principal, 2)}</span>
            </div>
            <div class="ads-detail-row">
              <span class="ads-detail-label">+ Hoitomaksu / kk</span>
              <span class="ads-detail-value">${formatEur(currentData.monthlyFee, 2)}</span>
            </div>
            <div class="ads-detail-row">
              <span class="ads-detail-label">Avausmaksu</span>
              <span class="ads-detail-value">${formatEur((currentData.openingFee || 0) - (currentData.toimistomaksu || 0), 2)}</span>
            </div>
            ${currentData.toimistomaksu > 0 ? `
            <div class="ads-detail-row">
              <span class="ads-detail-label">Toimistomaksu</span>
              <span class="ads-detail-value">${formatEur(currentData.toimistomaksu, 2)}</span>
            </div>` : ''}
            <div class="ads-detail-row">
              <span class="ads-detail-label">Jäännösarvo / loppuerä</span>
              <span class="ads-detail-value">${formatEur(currentData.balloon, 2)}</span>
            </div>
            <div class="ads-detail-row ads-detail-total">
              <span class="ads-detail-label">Ylimaksu vs. listahinta</span>
              <span class="ads-detail-value" style="color:${verdict.color}">
                ${formatEur(currentDeal.totalFinanceCost, 2)}
                (${currentData.price > 0 ? ((currentDeal.totalFinanceCost / currentData.price) * 100).toFixed(1) : '0.0'}%)
              </span>
            </div>
          </div>

          <div class="ads-divider"></div>

          <div class="ads-inputs">
            <div class="ads-inputs-title">✏️ Korjaa arvot</div>
            <div class="ads-input-row">
              <label class="ads-input-label" for="ads-rate-input">
                Nimelliskorko %
                ${state.rateFromPage ? '<span class="ads-from-page">(sivulta)</span>' : '<span class="ads-note">(oletus)</span>'}
              </label>
              <div class="ads-input-wrap">
                <input
                  id="ads-rate-input"
                  class="ads-input"
                  type="number"
                  min="0" max="30" step="0.01"
                  value="${state.nominalRatePct.toFixed(2)}"
                  placeholder="esim. 3.99"
                />
                <span class="ads-input-unit">%</span>
              </div>
            </div>
            <div class="ads-input-row">
              <label class="ads-input-label" for="ads-monthly-input">
                Kuukausierä €
                ${state.monthlyFromPage ? '<span class="ads-from-page">(sivulta)</span>' : '<span class="ads-note">(laskettu)</span>'}
              </label>
              <div class="ads-input-wrap">
                <input
                  id="ads-monthly-input"
                  class="ads-input"
                  type="number"
                  min="0" max="99999" step="1"
                  value="${state.monthlyPaymentGiven ? state.monthlyPaymentGiven.toFixed(2) : currentDeal.monthlyPayment.toFixed(2)}"
                  placeholder="esim. 299"
                />
                <span class="ads-input-unit">€</span>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:12px; margin-top:10px;">
              <button class="ads-recalc-btn" id="ads-recalc-btn" style="margin-top:0; flex:1;">🔄 Laske uudelleen</button>
              <button id="ads-reset-overrides" style="all:unset; cursor:pointer; font-size:11px; color:#6b7280; text-decoration:underline;">Nollaa</button>
            </div>
          </div>

          ${warnings.length ? `<div class="ads-warning">${warnings.map(w => `⚠️ ${w}`).join('<br>')}</div>` : ''}

          <!-- Task 2: Report broken data with dynamic URL -->
          <div class="ads-footer">
            Nettiauto Financing Analyser · ilmainen ·
            <a href="https://github.com/Ahmedaltu/Nettiauto-Financing-Analyser" target="_blank" rel="noopener noreferrer">GitHub</a>
            · <a href="https://github.com/Ahmedaltu/Nettiauto-Financing-Analyser/issues/new?title=Broken+data&body=Listing+URL:+${encodeURIComponent(window.location.href)}" target="_blank" rel="noopener noreferrer">⚠️ Report broken data</a>
          </div>
        </div>
      `;

      // Toggle
      panel.querySelector('#ads-toggle-btn').addEventListener('click', () => {
        const body = panel.querySelector('#ads-body');
        const btn = panel.querySelector('#ads-toggle-btn');
        const collapsed = body.style.display === 'none';
        body.style.display = collapsed ? 'block' : 'none';
        btn.textContent = collapsed ? '▲' : '▼';
      });

      // Recalculate button
      panel.querySelector('#ads-recalc-btn').addEventListener('click', () => {
        const rateVal = parseFloat(panel.querySelector('#ads-rate-input').value);
        const monthlyVal = parseFloat(panel.querySelector('#ads-monthly-input').value);

        const overrides = { savedAt: Date.now() };

        if (Number.isFinite(rateVal) && rateVal >= 0 && rateVal <= 30) {
          state.nominalRatePct = rateVal;
          state.rateFromPage = false;
          overrides.nominalRatePct = rateVal;
        }
        if (Number.isFinite(monthlyVal) && monthlyVal >= 10) {
          state.monthlyPaymentGiven = monthlyVal;
          state.monthlyFromPage = false;
          overrides.monthlyPaymentGiven = monthlyVal;
        }

        // Task 1: Save overrides to storage
        chrome.storage.local.set({ userOverrides: overrides }).catch(() => {});

        renderPanel();
      });

      // Reset button listener
      panel.querySelector('#ads-reset-overrides')?.addEventListener('click', () => {
        chrome.storage.local.remove("userOverrides").catch(() => {});
        // Re-parse or just reset state to parsed data
        state.nominalRatePct = data.nominalRatePct ?? 4.0;
        state.monthlyPaymentGiven = data.monthlyPaymentGiven ?? null;
        state.rateFromPage = data.nominalRatePct != null;
        state.monthlyFromPage = data.monthlyPaymentGiven != null;
        renderPanel();
      });

      // Also recalc on Enter key in inputs
      ['#ads-rate-input', '#ads-monthly-input'].forEach(sel => {
        panel.querySelector(sel)?.addEventListener('keydown', e => {
          if (e.key === 'Enter') panel.querySelector('#ads-recalc-btn').click();
        });
      });
    }

    renderPanel();
    // Task 1: Load storage AFTER initial render to avoid race conditions
    loadSavedOverrides();

    const h1 = document.querySelector('h1');
    if (h1 && h1.parentElement) {
      h1.parentElement.insertBefore(panel, h1.nextSibling);
    } else {
      (document.querySelector('main, article, #content') || document.body).prepend(panel);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Search badges
  // ────────────────────────────────────────────────────────────────────────────

  function injectSearchBadges() {
    if (searchObserver) { searchObserver.disconnect(); searchObserver = null; }
    processSearchCards();
    searchObserver = new MutationObserver(() => {
      if (searchRaf) return;
      searchRaf = requestAnimationFrame(() => {
        searchRaf = 0;
        processSearchCards();
      });
    });
    searchObserver.observe(document.body, { childList: true, subtree: true });
  }

  function processSearchCards() {
    const cards = document.querySelectorAll([
      '.car-list-item', '.listing-item', '.result-item',
      '[class*="car-item"]', '[class*="listing-card"]'
    ].join(','));

    cards.forEach(card => {
      if (card.dataset.adsProcessed === '1') return;
      const text = safeText(card);
      const priceMatch = text.match(/(\d[\d\s]{2,6})\s*€/);
      const price = priceMatch ? extractNumber(priceMatch[1]) : null;
      if (!price || price < 2000) return;

      const monthlyMatch = text.match(/[Kk]uukausier[äa][:\s]*(\d[\d\s,]+)\s*€/i)
        || text.match(/[Vv]ähimmäiser[äa][:\s]*(\d[\d\s,]+)\s*€/i);
      const monthly = monthlyMatch ? extractNumber(monthlyMatch[1]) : null;

      const deal = computeDeal({ price, downPayment: 0, termMonths: 60, nominalRatePct: 4.0, monthlyPaymentGiven: monthly });
      if (!deal) return;

      const verdict = getVerdict(deal.totalFinanceCost, price, deal.apr, 60);
      const badge = document.createElement('div');
      badge.className = 'ads-badge';
      badge.innerHTML = `<span class="ads-badge-label" style="color:${verdict.color}; border-color:${verdict.color}20; background:${verdict.bg}">~${formatEur(deal.totalPaid, 0)} yhteensä · ${verdict.label}</span>`;
      card.dataset.adsProcessed = '1';
      card.style.position = card.style.position || 'relative';
      card.appendChild(badge);
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Wait for async data
  // ────────────────────────────────────────────────────────────────────────────

  function waitForFinancingData(callback, timeout = 5000) {
    let done = false;
    let timeoutId = null;

    const isReady = () => {
      if (document.querySelector('#opd_mir, #opdLoanPeriod, .vehicle-info-box')) return true;
      const txt = document.body.textContent || '';
      return /kuukausier|kuukausimaksu|korko|rahoitus/i.test(txt);
    };

    const finish = () => {
      if (done) return;
      done = true;
      observer.disconnect();
      if (timeoutId) clearTimeout(timeoutId);
      callback();
    };

    if (isReady()) {
      callback();
      return;
    }

    const observer = new MutationObserver(() => {
      if (isReady()) finish();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    timeoutId = setTimeout(finish, timeout);
  }

  function injectNoFinancingPanel(data) {
    removeExistingPanel();
    const panel = document.createElement('div');
    panel.id = 'ads-panel';
    panel.innerHTML = `
      <div class="ads-header">
        <div class="ads-logo">
          <span class="ads-logo-icon">🔍</span>
          <span class="ads-logo-text">Nettiauto Financing Analyser</span>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <div class="ads-confidence" style="background:#1c1000; color:#f59e0b;">Ei rahoitusta</div>
          <button class="ads-toggle" id="ads-toggle-btn">▲</button>
        </div>
      </div>
      <div class="ads-body" id="ads-body">
        <div style="padding:8px 0 4px 0; font-size:12px; color:#6b7280; line-height:1.6;">
          Tässä ilmoituksessa ei ole rahoitustietoja.<br>
          Syötä tiedot alla laskeaksesi kokonaiskustannuksen.
        </div>
        <div class="ads-divider"></div>
        <div class="ads-inputs">
          <div class="ads-inputs-title">✏️ Syötä rahoitustiedot</div>
          <div class="ads-input-row">
            <label class="ads-input-label" for="ads-rate-input">Nimelliskorko %</label>
            <div class="ads-input-wrap">
              <input id="ads-rate-input" class="ads-input" type="number" min="0" max="30" step="0.01" value="4.00" placeholder="esim. 3.99"/>
              <span class="ads-input-unit">%</span>
            </div>
          </div>
          <div class="ads-input-row">
            <label class="ads-input-label" for="ads-monthly-input">Kuukausierä €</label>
            <div class="ads-input-wrap">
              <input id="ads-monthly-input" class="ads-input" type="number" min="0" max="99999" step="1" value="" placeholder="esim. 299"/>
              <span class="ads-input-unit">€</span>
            </div>
          </div>
          <div class="ads-input-row">
            <label class="ads-input-label" for="ads-term-input">Laina-aika (kk)</label>
            <div class="ads-input-wrap">
              <input id="ads-term-input" class="ads-input" type="number" min="12" max="96" step="1" value="60" placeholder="60"/>
              <span class="ads-input-unit">kk</span>
            </div>
          </div>
          <button class="ads-recalc-btn" id="ads-recalc-btn">🔄 Laske</button>
        </div>
        <div id="ads-result-area"></div>
        <div class="ads-footer">
          Nettiauto Financing Analyser · ilmainen ·
          <a href="https://github.com/Ahmedaltu/Nettiauto-Financing-Analyser" target="_blank" rel="noopener noreferrer">GitHub</a> ·
          <a href="https://github.com/Ahmedaltu/Nettiauto-Financing-Analyser/issues/new?title=Broken+data&body=Listing+URL:+${encodeURIComponent(window.location.href)}" target="_blank" rel="noopener noreferrer">⚠️ Report broken data</a>
        </div>
      </div>
    `;

    panel.querySelector('#ads-toggle-btn').addEventListener('click', () => {
      const body = panel.querySelector('#ads-body');
      const btn = panel.querySelector('#ads-toggle-btn');
      const collapsed = body.style.display === 'none';
      body.style.display = collapsed ? 'block' : 'none';
      btn.textContent = collapsed ? '▲' : '▼';
    });

    panel.querySelector('#ads-recalc-btn').addEventListener('click', () => {
      const rate = parseFloat(panel.querySelector('#ads-rate-input').value);
      const monthly = parseFloat(panel.querySelector('#ads-monthly-input').value);
      const term = parseInt(panel.querySelector('#ads-term-input').value);
      if (!Number.isFinite(rate) || !Number.isFinite(term)) return;

      const deal = computeDeal({
        price: data.price,
        downPayment: 0,
        termMonths: term,
        nominalRatePct: rate,
        monthlyFee: 0,
        openingFee: 0,
        balloon: 0,
        monthlyPaymentGiven: Number.isFinite(monthly) && monthly > 0 ? monthly : null,
      });
      if (!deal) return;

      const verdict = getVerdict(deal.totalFinanceCost, data.price, deal.apr, term);
      const resultArea = panel.querySelector('#ads-result-area');
      resultArea.innerHTML = `
        <div class="ads-divider"></div>
        <div class="ads-grid" style="margin-bottom:0;">
          <div class="ads-stat">
            <div class="ads-stat-label">Listahinta</div>
            <div class="ads-stat-value">${formatEur(data.price, 0)}</div>
          </div>
          <div class="ads-stat ads-stat-highlight">
            <div class="ads-stat-label">Maksat yhteensä</div>
            <div class="ads-stat-value" style="color:#ef4444">${formatEur(deal.totalPaid, 2)}</div>
          </div>
          <div class="ads-stat">
            <div class="ads-stat-label">Rahoituksen kulut</div>
            <div class="ads-stat-value" style="color:#f59e0b">${formatEur(deal.totalFinanceCost, 2)}</div>
          </div>
          <div class="ads-stat">
            <div class="ads-stat-label">Kuukausierä</div>
            <div class="ads-stat-value" style="color:#60a5fa">${formatEur(deal.totalMonthlyWithFee, 2)}</div>
          </div>
          <div class="ads-stat">
            <div class="ads-stat-label">Tod. vuosikorko</div>
            <div class="ads-stat-value" style="color:#a78bfa">${formatPct(deal.apr)}</div>
          </div>
          <div class="ads-stat">
            <div class="ads-stat-label">Tuomio</div>
            <div class="ads-stat-value" style="color:${verdict.color}">${verdict.label}</div>
          </div>
        </div>
      `;
    });

    ['#ads-rate-input', '#ads-monthly-input', '#ads-term-input'].forEach(sel => {
      panel.querySelector(sel)?.addEventListener('keydown', e => {
        if (e.key === 'Enter') panel.querySelector('#ads-recalc-btn').click();
      });
    });

    const h1 = document.querySelector('h1');
    if (h1 && h1.parentElement) {
      h1.parentElement.insertBefore(panel, h1.nextSibling);
    } else {
      (document.querySelector('main, article, #content') || document.body).prepend(panel);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Main
  // ────────────────────────────────────────────────────────────────────────────

  function run() {
    if (isListingPage()) {
      if (searchObserver) { searchObserver.disconnect(); searchObserver = null; }
      waitForFinancingData(() => {
        const data = parseListingPage();
        if (!data.price) return;

        // Private listing with no financing info — show manual input panel
        const hasFinancing = data.monthlyPaymentGiven || data.nominalRatePct ||
          /rahoitus|kuukausierä|osamaksu/i.test(safeText(document.body));
        if (!hasFinancing) {
          injectNoFinancingPanel(data);
          return;
        }

        const deal = computeDeal({
          price: data.price,
          downPayment: data.downPayment,
          termMonths: data.termMonths || 60,
          nominalRatePct: data.nominalRatePct ?? 4.0,
          monthlyFee: data.monthlyFee || 0,
          openingFee: data.openingFee || 0,
          balloon: data.balloon || 0,
          monthlyPaymentGiven: data.monthlyPaymentGiven,
          openingFeeFinanced: data.openingFeeFinanced
        });
        if (deal) {
          injectPanel(data);
        } else {
          injectNoFinancingPanel(data);
        }
      });
    } else if (isSearchPage()) {
      removeExistingPanel();
      injectSearchBadges();
    } else {
      removeExistingPanel();
      if (searchObserver) { searchObserver.disconnect(); searchObserver = null; }
    }
  }

  run();

  if (urlObserver) urlObserver.disconnect();
  urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      // Task 1: Clear overrides on navigation so next listing uses parsed defaults
      chrome.storage.local.remove("userOverrides").catch(() => {});
      lastUrl = location.href;
      document.querySelectorAll('.ads-badge').forEach(el => el.remove());
      document.querySelectorAll('[data-ads-processed]').forEach(el => delete el.dataset.adsProcessed);
      setTimeout(run, 700);
    }
  });
  urlObserver.observe(document.documentElement, { childList: true, subtree: true });

})();

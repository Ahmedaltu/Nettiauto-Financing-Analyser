# 🔍 Nettiauto Financing Analyser

> Näe auton rahoituksen todellinen kokonaishinta suoraan Nettiauto-sivulla.
> See the real total cost of car financing directly on Nettiauto listings.

---

## What it does

Finnish car dealers advertise low monthly payments — but hide the real total cost inside fees, long loan terms, and office fees (toimistomaksu). Nettiauto Financing Analyser injects a panel directly onto every Nettiauto listing showing:

- **Total paid** (all-in: price + interest + all fees)
- **Financing cost** — what you pay on top of the car price
- **Real monthly payment** including all fees
- **Effective APR** (todellinen vuosikorko) — calculated via bisection method
- **Toimistomaksu** — office fee detected and included automatically
- **Deal verdict**: Erinomainen / Hyvä / Kohtalainen / Kallis
- **Editable inputs** — correct rate or monthly payment and recalculate instantly
- **Private listing mode** — manual input form when no financing info is shown

<img width="770" height="990" alt="image" src="https://github.com/user-attachments/assets/fb0319e7-be0e-4ab3-afe0-3b4fbbce2491" />

---

## Install

### From Chrome Web Store
[**Add to Chrome →**](https://chrome.google.com/webstore/detail/nettiauto-financing-analyser)

### Load manually (developer mode)
1. Clone or download this repo
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the repo folder
6. Browse to any Nettiauto listing — the panel appears automatically

---

## How it works

The extension is 100% local — it reads what your browser already downloaded from Nettiauto. No data is sent anywhere. No server. No scraping.

```
Nettiauto loads in Chrome
        ↓
Extension reads the DOM (price, rate, term, fees, toimistomaksu)
        ↓
Calculates total cost + APR in <1ms
        ↓
Injects panel onto the page
```

**Key data sources used:**
- Price → `.details-page-header__item-price-main`
- Rate → OP financing widget (`#opd_mir`) — only reliable rate available on Nettiauto
- Toimistomaksu → `.vehicle-info-box` label/value pair
- Term → OP financing widget selected value

---

## Deal verdicts

| Verdict | Meaning |
|---|---|
| ✅ Erinomainen | Effective APR < 6% |
| 🔵 Hyvä | Effective APR 6–9% |
| 🟡 Kohtalainen | Effective APR 9–13% |
| 🔴 Kallis | Effective APR > 13% |

If effective APR cannot be computed, verdict falls back to overpay ratio vs. car price.

---

## Notes

- Nettiauto does not show the dealer's own financing rate on listing pages — the extension uses the OP bank financing widget rate as the best available approximation. You can correct it manually using the "Korjaa arvot" section.
- The `alk. X €/kk` teaser payment shown on listings is a minimum/marketing figure and is intentionally ignored — the extension calculates the real payment from the rate.
- Toimistomaksu (office fee) is read directly from the car details table and included in all calculations.
- The extension does **not** collect any data, require login, or make any network requests.

---

## Stack

- Vanilla JS (no frameworks, no dependencies)
- Chrome Extension Manifest V3
- CSS injected into Nettiauto pages
- No remote code — all system fonts, zero external requests

---

## Regression checks

Run lightweight parser and finance-math checks locally:

```bash
node tests/regression.js
```

---

## Playwright UI tests

```bash
npm install
npx playwright install chromium
npx playwright test
```

---

## Roadmap

- [ ] Compare mode — save multiple listings and compare side by side
- [ ] Firefox support
- [ ] Alert when a listing matches your criteria (price range, max APR)
- [ ] Export comparison to PDF

---

## Privacy

This extension collects no data. Everything runs locally in your browser. No servers, no cookies, no tracking. See [privacy policy](https://ahmedaltu.github.io/Nettiauto-Financing-Analyser/privacy).

---

## Legal

Reading a public webpage's DOM in your own browser is legal. This extension makes no automated requests to Nettiauto's servers.

---

## License

MIT
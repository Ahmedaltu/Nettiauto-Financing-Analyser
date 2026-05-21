# 🔍 Nettiauto Financing Analyser

> Näe auton rahoituksen todellinen kokonaishinta suoraan Nettiauto-sivulla.  
> See the real total cost of car financing directly on Nettiauto listings.

---

## Install

[**Add to Chrome — Free →**](https://chromewebstore.google.com/detail/nettiauto-financing-analy/jokpkmmmdnmaomdhkjdinmidhbgbjegb)

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

**Key data sources:**
- Price → `.details-page-header__item-price-main`
- Rate → OP financing widget (`#opd_mir`)
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

- Nettiauto does not show the dealer's own financing rate — the extension uses the OP bank financing widget rate as the best available approximation. You can correct it manually in the "Korjaa arvot" section.
- The `alk. X €/kk` teaser payment is a minimum/marketing figure and is intentionally ignored.
- Toimistomaksu is read directly from the car details table and included in all calculations.
- Your rate and payment corrections are saved locally on your device using Chrome storage. Nothing leaves your browser.

---

## Stack

- Vanilla JS — no frameworks, no dependencies
- Chrome Extension Manifest V3
- No remote code — system fonts only, zero external requests

---

## Roadmap

- [ ] Compare mode — save and compare multiple listings side by side
- [ ] Firefox support
- [ ] Price drop and financing change alerts
- [ ] Export comparison to PDF

---

## Privacy

No data collected. Everything runs locally in your browser. No servers, no cookies, no tracking.  
[Privacy policy →](https://ahmedaltu.github.io/Nettiauto-Financing-Analyser/privacy)

---

## Legal

Reading a public webpage's DOM in your own browser is legal. This extension makes no automated requests to Nettiauto's servers.

---

## License

MIT
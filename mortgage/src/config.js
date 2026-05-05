/* =========================================================================
 * config.js — Editable configuration for the mortgage app.
 *
 * Update rates, MI/PMI factors, Florida tax/insurance defaults, DTI caps,
 * minimum down payments, pricing labels, and disclaimers here. Avoid putting
 * these values anywhere else in the code.
 *
 * Exposed globally as window.CONFIG.
 * ========================================================================= */

(function () {
  const CONFIG = {
    /* ---------- Loan term ---------- */
    loanTermYears: 30,

    /* ---------- DTI caps (used as soft hints in advisor summary) ---------- */
    dtiCaps: {
      fha: 0.56,          // FHA can stretch with comp factors
      conventional: 0.50, // typical AUS limit
      itin: 0.50,
      foreignNational: 0.50,
      bankStatement: 0.50,
      pl: 0.50,
      dscr: null,         // DSCR doesn't use borrower DTI
    },

    /* ---------- Florida defaults ---------- */
    defaults: {
      annualPropertyTaxPct: 0.0150,   // 1.50% of purchase price / yr
      annualHomeownersInsPct: 0.0080, // 0.80% of purchase price / yr
      monthlyHO6: 150,                // condo HO-6 default
      monthlyHOA: 0,
    },

    /* ---------- FHA ---------- */
    fha: {
      minDownPct: 0.035,
      upfrontMipPct: 0.0175,           // 1.75% of base loan amount
      monthlyMipFactor: {
        downBelow5: 0.0055,            // 0.55% annually
        down5OrMore: 0.0050,           // 0.50% annually
      },
      rates: {
        '620_679': 0.0625,
        '680_plus': 0.0600,
        unknown: 0.0625, // also flag manual review
      },
    },

    /* ---------- Conventional ---------- */
    conventional: {
      minDownPct: {
        primary: 0.03,       // 3% min for primary
        secondHome: 0.10,
        investment: 0.15,
      },
      pmiCutoffPct: 0.20,    // 20% down → no PMI
      // Rates indexed by [creditBracket][downBelow20 ? 'below20' : '20plus']
      rates: {
        '620_639': { below20: 0.07375, '20plus': 0.07125 },
        '640_659': { below20: 0.07125, '20plus': 0.06875 },
        '660_679': { below20: 0.06875, '20plus': 0.06625 },
        '680_719': { below20: 0.06625, '20plus': 0.06375 },
        '720_739': { below20: 0.06375, '20plus': 0.06125 },
        '740_759': { below20: 0.06250, '20plus': 0.06000 },
        '760_plus': { below20: 0.06125, '20plus': 0.05875 },
        unknown: { below20: 0.06875, '20plus': 0.06875 },
      },
      // PMI factors indexed by [downBracket][creditBracket]
      // downBracket: 3to5 | 5to10 | 10to15 | 15to20
      pmi: {
        '3to5': {
          '620_639': 0.0110, '640_659': 0.0095, '660_679': 0.0080,
          '680_719': 0.0065, '720_739': 0.0050, '740_759': 0.0040, '760_plus': 0.0030,
        },
        '5to10': {
          '620_639': 0.0095, '640_659': 0.0080, '660_679': 0.0065,
          '680_719': 0.0050, '720_739': 0.0040, '740_759': 0.0030, '760_plus': 0.0025,
        },
        '10to15': {
          '620_639': 0.0075, '640_659': 0.0065, '660_679': 0.0050,
          '680_719': 0.0040, '720_739': 0.0030, '740_759': 0.0025, '760_plus': 0.0020,
        },
        '15to20': {
          '620_639': 0.0050, '640_659': 0.0040, '660_679': 0.0030,
          '680_719': 0.0025, '720_739': 0.0020, '740_759': 0.0015, '760_plus': 0.0012,
        },
      },
    },

    /* ---------- Specialty / Non-QM programs ----------
       Internal-only illustrative rates. Borrower-facing display uses pricing
       categories, not exact rates, unless `showRates` is enabled below. */
    specialty: {
      itin:            { minDownPct: 0.15, illustrativeRate: 0.0850 },
      foreignNational: { minDownPct: 0.25, illustrativeRate: 0.0875 },
      bankStatement:   { minDownPct: 0.10, illustrativeRate: 0.0800 },
      pl:              { minDownPct: 0.15, illustrativeRate: 0.0825 },
      dscr: {
        // by immigration status
        minDownPct: {
          us_citizen_or_pr:        0.15,
          ead:                     0.15,
          investor_visa:           0.15,
          tourist_student_itin:    0.20,
          foreign_national_no_visa: 0.25,
          none_of_above:           null, // manual review
        },
        illustrativeRate: 0.0800,
      },
    },

    /* ---------- Pricing categories (borrower-facing labels) ---------- */
    pricingLabels: {
      most_competitive: 'Most competitive pricing',
      standard_nonqm:   'Standard Non-QM pricing',
      specialty:        'Specialty program pricing',
      manual:           'Manual pricing review needed',
    },

    /* ---------- Display toggles ---------- */
    display: {
      showRatesToBorrower: false,    // if true, show illustrative rates on results
      paymentRangeSpread: 0.03,      // ±3% borrower-facing range
    },

    /* ---------- Disclaimers ---------- */
    disclaimers: {
      noCreditPull:
        'No credit report will be pulled. Your credit score will not be affected.',
      illustrationOnly:
        'This is only an estimate. No credit pull. No obligation.',
      results:
        'Based on the information you provided, the programs below may fit your situation. ' +
        'This is not a loan approval, not a mortgage application, and not a guaranteed rate quote. ' +
        'No credit was pulled. Your final approval, rate, payment, down payment, and closing costs ' +
        'depend on a complete mortgage review, including credit, income, assets, property details, ' +
        'occupancy, documentation, market conditions, and lender guidelines.',
      paymentRange:
        'This range is for illustration only. Your final payment may be higher or lower depending on ' +
        'credit, rate, taxes, insurance, HOA, loan amount, market conditions, and lender guidelines.',
      contactConsent:
        'By submitting this form, you agree to be contacted about mortgage options. This is not a ' +
        'mortgage application and does not guarantee loan approval. No credit will be pulled unless ' +
        'you later authorize a formal mortgage application.',
      thankYou:
        'Thank you. Your information was sent for review. No credit was pulled. ' +
        'A mortgage advisor will review your answers and contact you to discuss possible options.',
      hoaUnknown:
        'Some properties, especially condos and townhomes, may have HOA or condo fees. ' +
        'If the property has an HOA, your actual monthly payment may be higher.',
    },
  };

  window.CONFIG = CONFIG;
})();

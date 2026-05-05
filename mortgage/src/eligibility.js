/* =========================================================================
 * eligibility.js — Program eligibility engine.
 *
 * Pure functions. Given the answers object, returns eligibility decisions
 * for FHA, Conventional, ITIN, Foreign National, Bank Statement, P&L, and
 * DSCR — with simple, borrower-friendly explanations.
 *
 * Exposed globally as window.Eligibility.
 * ========================================================================= */

(function () {
  const C = () => window.CONFIG;

  /* ---------- Helpers ---------- */

  // Map answer credit bracket -> rate bracket key for FHA
  function fhaCreditBracket(creditScore) {
    if (creditScore === 'below_620') return null;
    if (creditScore === 'no_fico' || creditScore === 'unknown') return 'unknown';
    if (['620_639', '640_659', '660_679'].includes(creditScore)) return '620_679';
    return '680_plus';
  }

  // Map answer credit bracket -> conventional rate/PMI bracket key
  function convCreditBracket(creditScore) {
    if (creditScore === 'below_620') return null;
    if (creditScore === 'no_fico' || creditScore === 'unknown') return 'unknown';
    return creditScore; // already matches: 620_639, 640_659, ... 760_plus
  }

  // Down-payment PMI bracket
  function pmiDownBracket(downPct) {
    if (downPct < 0.05) return '3to5';
    if (downPct < 0.10) return '5to10';
    if (downPct < 0.15) return '10to15';
    if (downPct < 0.20) return '15to20';
    return null; // 20%+ → no PMI
  }

  function isSelfEmployedIncomeType(incomeType) {
    return [
      'self_employed_tax_returns',
      'self_employed_writeoffs',
      'bank_statements',
      'pl',
    ].includes(incomeType);
  }

  // Classify self-employed tax-return strength.
  function selfEmployedTaxReturnStrength(answers) {
    if (!isSelfEmployedIncomeType(answers.incomeType)) return 'n/a';

    const reported = answers.seReportedIncome;
    const writeOffs = answers.seWriteOffs;
    const taxes = answers.seTaxesPaid;

    let strongHits = 0;
    let weakHits = 0;

    if (['100_150', '150_250', 'over_250', '75_100'].includes(reported)) strongHits++;
    if (['under_25', '25_50'].includes(reported)) weakHits++;

    if (taxes === '10_20' || taxes === '20_40' || taxes === 'over_40') strongHits++;
    if (taxes === 'under_5' || taxes === 'refund') weakHits++;

    if (writeOffs === 'no_most_shows') strongHits++;
    if (writeOffs === 'yes_a_lot') weakHits++;

    if (strongHits >= 1 && weakHits === 0) return 'strong';
    if (weakHits >= 1 && strongHits === 0) return 'weak';
    if (strongHits === 0 && weakHits === 0) return 'unknown';
    return 'mixed'; // some signals each way → manual review
  }

  // Compute actual down payment percent from purchase price + down dollar amount.
  function downPaymentPct(answers) {
    const price = Number(answers.purchasePrice) || 0;
    const dollar = Number(answers.downPaymentDollar) || 0;
    if (price > 0 && dollar > 0) return dollar / price;
    if (answers.downPaymentPercent) return Number(answers.downPaymentPercent) / 100;
    return 0;
  }

  /* ---------- Per-program evaluators ---------- */

  function evaluateFHA(answers) {
    const reasons = [];
    const blockers = [];
    let manualReview = false;
    const dnPct = downPaymentPct(answers);

    if (answers.immigrationStatus !== 'us_citizen_or_pr') {
      blockers.push('FHA generally requires U.S. Citizenship or Permanent Resident status.');
    }
    if (answers.propertyPurpose !== 'primary') {
      blockers.push('FHA is generally for primary residences only.');
    }
    if (dnPct > 0 && dnPct < C().fha.minDownPct) {
      blockers.push('FHA requires at least 3.5% down.');
    }
    if (answers.creditScore === 'below_620') {
      blockers.push('FHA in this calculator requires a 620 or higher credit score.');
    }
    if (answers.creditScore === 'no_fico') {
      blockers.push('FHA in this calculator requires a U.S. credit score.');
    }

    // Income type: W-2 OK; self-employed only if tax-return strength is strong/mixed
    const incomeOK = (() => {
      if (answers.incomeType === 'w2') return true;
      if (isSelfEmployedIncomeType(answers.incomeType)) {
        const s = selfEmployedTaxReturnStrength(answers);
        if (s === 'strong') return true;
        if (s === 'mixed' || s === 'unknown') { manualReview = true; return true; }
        return false;
      }
      return false;
    })();
    if (!incomeOK) {
      blockers.push('FHA generally needs W-2 or self-employed income that shows on tax returns.');
    }

    if (answers.creditScore === 'unknown') manualReview = true;

    if (blockers.length === 0) {
      reasons.push('You may meet the basic FHA conditions: primary residence, eligible status, ' +
                   'and at least 3.5% down.');
    }

    return {
      key: 'fha',
      name: 'FHA',
      eligible: blockers.length === 0,
      manualReview,
      reasons,
      blockers,
      pricingCategory: 'most_competitive',
    };
  }

  function evaluateConventional(answers) {
    const reasons = [];
    const blockers = [];
    let manualReview = false;
    const dnPct = downPaymentPct(answers);

    if (!['us_citizen_or_pr', 'ead', 'investor_visa'].includes(answers.immigrationStatus)) {
      blockers.push('Conventional generally requires U.S. Citizenship, Permanent Resident, ' +
                    'Employment Authorization, or Investor Visa with SSN.');
    }
    const minByOcc =
      answers.propertyPurpose === 'investment' ? C().conventional.minDownPct.investment :
      answers.propertyPurpose === 'second_home' ? C().conventional.minDownPct.secondHome :
      C().conventional.minDownPct.primary;
    if (dnPct > 0 && dnPct < minByOcc) {
      blockers.push(
        `Conventional requires at least ${(minByOcc * 100).toFixed(0)}% down for this occupancy.`
      );
    }
    if (answers.creditScore === 'below_620') {
      blockers.push('Conventional in this calculator requires a 620 or higher credit score.');
    }
    if (answers.creditScore === 'no_fico') {
      blockers.push('Conventional in this calculator requires a U.S. credit score.');
    }
    if (answers.creditScore === 'unknown') manualReview = true;

    const incomeOK = (() => {
      if (answers.incomeType === 'w2') return true;
      if (isSelfEmployedIncomeType(answers.incomeType)) {
        const s = selfEmployedTaxReturnStrength(answers);
        if (s === 'strong') return true;
        if (s === 'mixed' || s === 'unknown') { manualReview = true; return true; }
        return false;
      }
      return false;
    })();
    if (!incomeOK) {
      blockers.push('Conventional generally needs W-2 or self-employed income shown on tax returns.');
    }

    if (blockers.length === 0) {
      reasons.push('You may meet the basic Conventional conditions for this property type and down payment.');
    }

    return {
      key: 'conventional',
      name: 'Conventional',
      eligible: blockers.length === 0,
      manualReview,
      reasons,
      blockers,
      pricingCategory: 'most_competitive',
    };
  }

  function evaluateITIN(answers) {
    const reasons = [];
    const blockers = [];
    let manualReview = false;
    const dnPct = downPaymentPct(answers);

    if (answers.immigrationStatus !== 'tourist_student_itin') {
      blockers.push('ITIN loans are designed for borrowers using an ITIN instead of an SSN.');
    }
    if (dnPct > 0 && dnPct < C().specialty.itin.minDownPct) {
      blockers.push('ITIN loans typically require at least 15% down.');
    }
    if (answers.creditScore === 'below_620') {
      blockers.push('ITIN in this calculator requires a 620 or higher credit score.');
    }
    if (answers.creditScore === 'no_fico') {
      manualReview = true;
    }
    if (answers.incomeType === 'no_income_asset' || answers.incomeType === 'foreign_income') {
      blockers.push('ITIN loans generally need documentable income (W-2, tax returns, bank statements, or P&L).');
    }
    if (answers.creditScore === 'unknown') manualReview = true;

    if (blockers.length === 0) {
      reasons.push('ITIN financing may fit if you use an ITIN instead of an SSN and have at least 15% down.');
    }

    return {
      key: 'itin',
      name: 'ITIN',
      eligible: blockers.length === 0,
      manualReview,
      reasons,
      blockers,
      pricingCategory: 'specialty',
    };
  }

  function evaluateForeignNational(answers) {
    const reasons = [];
    const blockers = [];
    let manualReview = false;
    const dnPct = downPaymentPct(answers);

    // Foreign National is most natural for foreign_national_no_visa, but
    // borrowers with foreign income may also fit. Allow a broad fit but flag review.
    const fnFit =
      answers.immigrationStatus === 'foreign_national_no_visa' ||
      answers.incomeType === 'foreign_income' ||
      answers.incomeType === 'no_income_asset';

    if (!fnFit) {
      blockers.push('Foreign National financing is designed for borrowers without a U.S. visa or ' +
                    'using foreign income/asset documentation.');
    }
    if (dnPct > 0 && dnPct < C().specialty.foreignNational.minDownPct) {
      blockers.push('Foreign National loans typically require at least 25% down.');
    }
    if (answers.immigrationStatus !== 'foreign_national_no_visa' &&
        ['us_citizen_or_pr', 'ead', 'investor_visa', 'tourist_student_itin'].includes(answers.immigrationStatus) &&
        answers.incomeType !== 'foreign_income' && answers.incomeType !== 'no_income_asset') {
      // already blocked by fnFit above; nothing extra
    }

    if (blockers.length === 0) {
      reasons.push('Foreign National financing may fit your profile and down payment.');
      if (answers.creditScore === 'no_fico') {
        reasons.push('Foreign National programs may allow no U.S. credit score.');
      }
    }

    return {
      key: 'foreign_national',
      name: 'Foreign National',
      eligible: blockers.length === 0,
      manualReview,
      reasons,
      blockers,
      pricingCategory: 'specialty',
    };
  }

  function evaluateBankStatement(answers) {
    const reasons = [];
    const blockers = [];
    let manualReview = false;
    const dnPct = downPaymentPct(answers);

    if (!['us_citizen_or_pr', 'ead', 'investor_visa'].includes(answers.immigrationStatus)) {
      blockers.push('Bank Statement loans in this calculator require U.S. Citizenship, ' +
                    'Permanent Resident, EAD, or Investor Visa with SSN.');
    }
    if (answers.incomeType === 'w2') {
      blockers.push('Bank Statement loans are designed for self-employed borrowers, not W-2-only income.');
    }
    if (!['self_employed_tax_returns', 'self_employed_writeoffs', 'bank_statements'].includes(answers.incomeType)) {
      // Other income types (P&L only, foreign, none, rental, other, unknown) generally don't fit.
      if (answers.incomeType !== 'unknown') {
        blockers.push('Bank Statement loans need self-employed income documentable through business bank statements.');
      } else {
        manualReview = true;
      }
    }
    if (dnPct > 0 && dnPct < C().specialty.bankStatement.minDownPct) {
      blockers.push('Bank Statement loans typically require at least 10% down.');
    }
    if (answers.creditScore === 'below_620') {
      blockers.push('Bank Statement loans in this calculator require a 620 or higher credit score.');
    }
    if (answers.creditScore === 'no_fico') {
      blockers.push('Bank Statement loans in this calculator require a U.S. credit score.');
    }
    if (answers.creditScore === 'unknown') manualReview = true;

    if (blockers.length === 0) {
      reasons.push('Bank Statement financing may better reflect your real income if your tax returns ' +
                   'show less because of write-offs.');
    }

    return {
      key: 'bank_statement',
      name: 'Bank Statement',
      eligible: blockers.length === 0,
      manualReview,
      reasons,
      blockers,
      pricingCategory: 'standard_nonqm',
    };
  }

  function evaluatePL(answers) {
    const reasons = [];
    const blockers = [];
    let manualReview = false;
    const dnPct = downPaymentPct(answers);

    if (!['us_citizen_or_pr', 'ead', 'investor_visa'].includes(answers.immigrationStatus)) {
      blockers.push('P&L loans in this calculator require U.S. Citizenship, ' +
                    'Permanent Resident, EAD, or Investor Visa with SSN.');
    }
    if (answers.incomeType === 'w2') {
      blockers.push('P&L loans are designed for self-employed borrowers, not W-2-only income.');
    }
    if (!['self_employed_tax_returns', 'self_employed_writeoffs', 'pl'].includes(answers.incomeType)) {
      if (answers.incomeType !== 'unknown') {
        blockers.push('P&L loans need a self-employed P&L statement (often CPA-prepared).');
      } else {
        manualReview = true;
      }
    }
    if (dnPct > 0 && dnPct < C().specialty.pl.minDownPct) {
      blockers.push('P&L loans typically require at least 15% down.');
    }
    if (answers.creditScore === 'below_620') {
      blockers.push('P&L loans in this calculator require a 620 or higher credit score.');
    }
    if (answers.creditScore === 'no_fico') {
      blockers.push('P&L loans in this calculator require a U.S. credit score.');
    }
    if (answers.creditScore === 'unknown') manualReview = true;

    if (blockers.length === 0) {
      reasons.push('A P&L statement may document your self-employment income for qualifying.');
    }

    return {
      key: 'pl',
      name: 'P&L',
      eligible: blockers.length === 0,
      manualReview,
      reasons,
      blockers,
      pricingCategory: 'standard_nonqm',
    };
  }

  function evaluateDSCR(answers) {
    const reasons = [];
    const blockers = [];
    let manualReview = false;
    const dnPct = downPaymentPct(answers);

    if (answers.propertyPurpose !== 'investment') {
      blockers.push('DSCR is normally used for investment properties only.');
      return {
        key: 'dscr',
        name: 'DSCR',
        eligible: false,
        manualReview: false,
        reasons,
        blockers,
        pricingCategory: 'specialty',
      };
    }

    const minByImm = C().specialty.dscr.minDownPct[
      answers.immigrationStatus === 'none_of_above' ? 'none_of_above' : answers.immigrationStatus
    ];

    if (minByImm === null || minByImm === undefined) {
      manualReview = true;
      blockers.push('DSCR requires manual review for this immigration status.');
    } else if (dnPct > 0 && dnPct < minByImm) {
      blockers.push(`DSCR requires at least ${(minByImm * 100).toFixed(0)}% down for this profile.`);
    }

    // Credit logic: FN can have no FICO; everyone else needs 620+
    const isFN = answers.immigrationStatus === 'foreign_national_no_visa';
    if (answers.creditScore === 'below_620') {
      blockers.push('DSCR in this calculator requires a 620 or higher credit score.');
    }
    if (answers.creditScore === 'no_fico' && !isFN) {
      blockers.push('DSCR for this profile requires a U.S. credit score.');
    }
    if (answers.creditScore === 'unknown') manualReview = true;

    if (blockers.length === 0) {
      reasons.push('DSCR uses the property’s rent rather than your personal income for qualifying.');
    }

    return {
      key: 'dscr',
      name: 'DSCR',
      eligible: blockers.length === 0,
      manualReview,
      reasons,
      blockers,
      pricingCategory: 'specialty',
    };
  }

  /* ---------- Main entry point ---------- */

  function evaluateAll(answers) {
    return [
      evaluateFHA(answers),
      evaluateConventional(answers),
      evaluateITIN(answers),
      evaluateForeignNational(answers),
      evaluateBankStatement(answers),
      evaluatePL(answers),
      evaluateDSCR(answers),
    ];
  }

  window.Eligibility = {
    evaluateAll,
    selfEmployedTaxReturnStrength,
    isSelfEmployedIncomeType,
    downPaymentPct,
    fhaCreditBracket,
    convCreditBracket,
    pmiDownBracket,
  };
})();

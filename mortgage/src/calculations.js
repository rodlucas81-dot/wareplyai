/* =========================================================================
 * calculations.js — Payment / loan-amount / DSCR math.
 *
 * Pure functions. Given the answers + a program eligibility result,
 * computes loan amount, monthly P&I, MI/PMI, escrows, total monthly
 * payment, total cash needed, and a borrower-facing payment range.
 *
 * Exposed globally as window.Calculations.
 * ========================================================================= */

(function () {
  const C = () => window.CONFIG;
  const E = () => window.Eligibility;

  /* ---------- Generic mortgage P&I ---------- */

  // M = P × [r(1+r)^n] / [(1+r)^n - 1]
  function principalAndInterest(loanAmount, annualRate, termYears) {
    const n = termYears * 12;
    const r = annualRate / 12;
    if (r === 0) return loanAmount / n;
    const factor = Math.pow(1 + r, n);
    return loanAmount * (r * factor) / (factor - 1);
  }

  /* ---------- Escrows / monthly assumptions ---------- */

  function monthlyTaxes(answers) {
    const price = Number(answers.purchasePrice) || 0;
    if (answers.knowsTaxes === 'yes' && Number(answers.annualTaxes) > 0) {
      return Number(answers.annualTaxes) / 12;
    }
    return (price * C().defaults.annualPropertyTaxPct) / 12;
  }

  function monthlyInsurance(answers) {
    const price = Number(answers.purchasePrice) || 0;
    if (answers.propertyType === 'condo') {
      if (answers.knowsHO6 === 'yes' && Number(answers.annualHO6) > 0) {
        return Number(answers.annualHO6) / 12;
      }
      return C().defaults.monthlyHO6;
    }
    if (answers.knowsInsurance === 'yes' && Number(answers.annualInsurance) > 0) {
      return Number(answers.annualInsurance) / 12;
    }
    return (price * C().defaults.annualHomeownersInsPct) / 12;
  }

  function monthlyHOA(answers) {
    if (answers.hasHOA === 'yes' && Number(answers.monthlyHOA) > 0) {
      return Number(answers.monthlyHOA);
    }
    return 0;
  }

  /* ---------- Down payment helpers ---------- */

  function downPaymentDollar(answers) {
    if (Number(answers.downPaymentDollar) > 0) return Number(answers.downPaymentDollar);
    if (Number(answers.downPaymentPercent) > 0 && Number(answers.purchasePrice) > 0) {
      return (Number(answers.downPaymentPercent) / 100) * Number(answers.purchasePrice);
    }
    return 0;
  }

  function baseLoanAmount(answers) {
    const price = Number(answers.purchasePrice) || 0;
    return Math.max(0, price - downPaymentDollar(answers));
  }

  /* ---------- Per-program rate selection ---------- */

  function rateForProgram(programKey, answers) {
    const cs = answers.creditScore;
    const dnPct = E().downPaymentPct(answers);

    switch (programKey) {
      case 'fha': {
        const k = E().fhaCreditBracket(cs);
        if (!k) return null;
        return C().fha.rates[k];
      }
      case 'conventional': {
        const k = E().convCreditBracket(cs);
        if (!k) return null;
        const tier = dnPct >= 0.20 ? '20plus' : 'below20';
        return C().conventional.rates[k][tier];
      }
      case 'itin':            return C().specialty.itin.illustrativeRate;
      case 'foreign_national':return C().specialty.foreignNational.illustrativeRate;
      case 'bank_statement':  return C().specialty.bankStatement.illustrativeRate;
      case 'pl':              return C().specialty.pl.illustrativeRate;
      case 'dscr':            return C().specialty.dscr.illustrativeRate;
      default: return null;
    }
  }

  /* ---------- Mortgage insurance / PMI ---------- */

  function fhaUpfrontMip(answers) {
    return baseLoanAmount(answers) * C().fha.upfrontMipPct;
  }

  function fhaMonthlyMi(answers) {
    const dnPct = E().downPaymentPct(answers);
    const factor = dnPct < 0.05
      ? C().fha.monthlyMipFactor.downBelow5
      : C().fha.monthlyMipFactor.down5OrMore;
    return (baseLoanAmount(answers) * factor) / 12;
  }

  function conventionalMonthlyPmi(answers) {
    const dnPct = E().downPaymentPct(answers);
    if (dnPct >= C().conventional.pmiCutoffPct) return 0;
    const downKey = E().pmiDownBracket(dnPct);
    const credKey = E().convCreditBracket(answers.creditScore);
    if (!downKey || !credKey || credKey === 'unknown') return 0; // unknown -> shown as manual review
    const factor = C().conventional.pmi[downKey][credKey];
    if (!factor) return 0;
    return (baseLoanAmount(answers) * factor) / 12;
  }

  /* ---------- Per-program payment calc ---------- */

  function computeProgramPayment(programKey, answers) {
    const taxes = monthlyTaxes(answers);
    const ins = monthlyInsurance(answers);
    const hoa = monthlyHOA(answers);
    const base = baseLoanAmount(answers);
    const dnPct = E().downPaymentPct(answers);
    const rate = rateForProgram(programKey, answers);
    const term = C().loanTermYears;

    let loanAmount = base;
    let upfrontMip = 0;
    let monthlyMi = 0;
    let pi = 0;

    if (programKey === 'fha') {
      upfrontMip = fhaUpfrontMip(answers);
      loanAmount = base + upfrontMip;
      monthlyMi = fhaMonthlyMi(answers);
      pi = rate ? principalAndInterest(loanAmount, rate, term) : 0;
    } else if (programKey === 'conventional') {
      monthlyMi = conventionalMonthlyPmi(answers);
      pi = rate ? principalAndInterest(loanAmount, rate, term) : 0;
    } else {
      // Specialty programs: no upfront/standard PMI
      pi = rate ? principalAndInterest(loanAmount, rate, term) : 0;
    }

    const piti = pi + monthlyMi + taxes + ins + hoa;

    const spread = C().display.paymentRangeSpread;
    const range = {
      low: piti * (1 - spread),
      high: piti * (1 + spread),
    };

    // Total cash needed = down payment + estimated closing costs (rough 3% of price)
    const closingCostsEst = Number(answers.purchasePrice || 0) * 0.03;
    const totalCashNeeded = downPaymentDollar(answers) + closingCostsEst;

    return {
      programKey,
      rate,
      loanAmount,
      basePrice: Number(answers.purchasePrice) || 0,
      downPaymentDollar: downPaymentDollar(answers),
      downPaymentPct: dnPct,
      principalAndInterest: pi,
      upfrontMip,
      monthlyMi,
      monthlyTaxes: taxes,
      monthlyInsurance: ins,
      monthlyHOA: hoa,
      totalMonthly: piti,
      paymentRange: range,
      closingCostsEst,
      totalCashNeeded,
    };
  }

  /* ---------- DSCR ratio ---------- */

  function dscrRatio(answers) {
    const rent = Number(answers.estimatedRent) || 0;
    if (rent <= 0) return null;
    const calc = computeProgramPayment('dscr', answers);
    if (!calc.totalMonthly) return null;
    return rent / calc.totalMonthly;
  }

  /* ---------- DTI ---------- */

  function frontEndDti(answers, totalMonthly) {
    const income = Number(answers.monthlyIncome) || 0;
    if (income <= 0) return null;
    return totalMonthly / income;
  }

  function backEndDti(answers, totalMonthly) {
    const income = Number(answers.monthlyIncome) || 0;
    if (income <= 0) return null;
    const debts = Number(answers.monthlyDebts) || 0;
    return (totalMonthly + debts) / income;
  }

  /* ---------- Formatters ---------- */

  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '—';
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function fmtMoney2(n) {
    if (n == null || isNaN(n)) return '—';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtPct(n, decimals = 2) {
    if (n == null || isNaN(n)) return '—';
    return (n * 100).toFixed(decimals) + '%';
  }

  window.Calculations = {
    principalAndInterest,
    monthlyTaxes,
    monthlyInsurance,
    monthlyHOA,
    downPaymentDollar,
    baseLoanAmount,
    rateForProgram,
    fhaUpfrontMip,
    fhaMonthlyMi,
    conventionalMonthlyPmi,
    computeProgramPayment,
    dscrRatio,
    frontEndDti,
    backEndDti,
    fmtMoney,
    fmtMoney2,
    fmtPct,
  };
})();

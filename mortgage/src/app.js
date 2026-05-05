/* =========================================================================
 * app.js — Question definitions + main App component.
 *
 * The questionnaire is data-driven. Each question lists its id, title, type,
 * options/helper text, and an optional `show(answers)` predicate so we can
 * skip conditional steps. All eligibility/payment work happens after the
 * questionnaire completes.
 * ========================================================================= */

const { useState, useMemo } = React;
const Comp = window.Components;
const E = window.Eligibility;
const F = window.Calculations;

/* ---------- Option lists ---------- */

const IMMIGRATION_OPTIONS = [
  { value: 'us_citizen_or_pr',         label: 'U.S. Citizen or Permanent Resident / Green Card' },
  { value: 'ead',                      label: 'Employment Authorization Card' },
  { value: 'investor_visa',            label: 'Investor Visa with Social Security Number' },
  { value: 'tourist_student_itin',     label: 'Tourist Visa or Student Visa with ITIN' },
  { value: 'foreign_national_no_visa', label: 'Foreign National with no U.S. visa' },
  { value: 'none_of_above',            label: 'None of the above' },
];

const PROPERTY_PURPOSE_OPTIONS = [
  { value: 'primary',     label: 'Primary residence' },
  { value: 'second_home', label: 'Second home' },
  { value: 'investment',  label: 'Investment property' },
];

const PROPERTY_TYPE_OPTIONS = [
  { value: 'sfh',         label: 'Single-family home' },
  { value: 'townhouse',   label: 'Townhouse' },
  { value: 'condo',       label: 'Condo' },
  { value: 'multi_2_4',   label: '2–4 unit property' },
  { value: 'unsure',      label: 'Not sure yet' },
];

const DOWN_RANGE_OPTIONS = [
  { value: '3_5',     label: '3% to 5%' },
  { value: '5_10',    label: '5% to 10%' },
  { value: '10_15',   label: '10% to 15%' },
  { value: '15_20',   label: '15% to 20%' },
  { value: '20_25',   label: '20% to 25%' },
  { value: 'over_25', label: '25% or more' },
];

const INCOME_TYPE_OPTIONS = [
  { value: 'w2',                         label: 'W-2 employee' },
  { value: 'self_employed_tax_returns',  label: 'Self-employed using tax returns' },
  { value: 'self_employed_writeoffs',    label: 'Self-employed but write off a lot of expenses' },
  { value: 'bank_statements',            label: 'Business bank statements' },
  { value: 'pl',                         label: 'Profit & Loss statement' },
  { value: 'foreign_income',             label: 'Foreign income' },
  { value: 'rental_real_estate',         label: 'Rental income / real estate investor' },
  { value: 'no_income_asset',            label: 'No income / asset-based / foreign national documentation' },
  { value: 'other',                      label: 'Other' },
  { value: 'unknown',                    label: 'I don’t know' },
];

const W2_TREND_OPTIONS = [
  { value: 'same',     label: 'About the same' },
  { value: 'higher',   label: 'Higher' },
  { value: 'lower',    label: 'Lower' },
  { value: 'not_sure', label: 'Not sure' },
];

const SE_REPORTED_OPTIONS = [
  { value: 'under_25',  label: 'Less than $25,000' },
  { value: '25_50',     label: '$25,000 to $50,000' },
  { value: '50_75',     label: '$50,000 to $75,000' },
  { value: '75_100',    label: '$75,000 to $100,000' },
  { value: '100_150',   label: '$100,000 to $150,000' },
  { value: '150_250',   label: '$150,000 to $250,000' },
  { value: 'over_250',  label: 'More than $250,000' },
  { value: 'unknown',   label: 'I don’t know' },
];

const SE_WRITEOFF_OPTIONS = [
  { value: 'yes_a_lot',     label: 'Yes, I write off a lot' },
  { value: 'some',          label: 'Some, but not too much' },
  { value: 'no_most_shows', label: 'No, my tax return shows most of my income' },
  { value: 'not_sure',      label: 'I’m not sure' },
];

const SE_TAXES_OPTIONS = [
  { value: 'under_5',   label: 'Less than $5,000' },
  { value: '5_10',      label: '$5,000 to $10,000' },
  { value: '10_20',     label: '$10,000 to $20,000' },
  { value: '20_40',     label: '$20,000 to $40,000' },
  { value: 'over_40',   label: 'More than $40,000' },
  { value: 'refund',    label: 'I usually get a refund' },
  { value: 'unknown',   label: 'I don’t know' },
];

const CREDIT_OPTIONS = [
  { value: 'no_fico',    label: 'No U.S. credit score / No FICO' },
  { value: 'below_620',  label: 'Below 620' },
  { value: '620_639',    label: '620–639' },
  { value: '640_659',    label: '640–659' },
  { value: '660_679',    label: '660–679' },
  { value: '680_719',    label: '680–719' },
  { value: '720_739',    label: '720–739' },
  { value: '740_759',    label: '740–759' },
  { value: '760_plus',   label: '760+' },
  { value: 'unknown',    label: 'I don’t know' },
];

const COBORROWER_OPTIONS = [
  { value: 'alone',         label: 'Buying alone' },
  { value: 'spouse',        label: 'Buying with spouse' },
  { value: 'family',        label: 'Buying with another family member' },
  { value: 'other_person',  label: 'Buying with another person' },
  { value: 'not_sure',      label: 'Not sure yet' },
];

const YES_NO_KNOW = [
  { value: 'yes',   label: 'Yes, I know the amount' },
  { value: 'no',    label: 'No, use an estimate' },
];

const HOA_OPTIONS = [
  { value: 'yes',     label: 'Yes' },
  { value: 'no',      label: 'No' },
  { value: 'unknown', label: 'I don’t know' },
];

/* ---------- Helpers ---------- */

const isSelfEmployedAnswer = (a) =>
  ['self_employed_tax_returns', 'self_employed_writeoffs', 'bank_statements', 'pl'].includes(a.incomeType);

/* ---------- Question list (in order; some are conditional) ---------- */

const QUESTIONS = [
  {
    id: 'immigrationStatus',
    title: 'What is your immigration status?',
    type: 'choice',
    options: IMMIGRATION_OPTIONS,
  },
  {
    id: 'propertyPurpose',
    title: 'How will you use the property?',
    type: 'choice',
    options: PROPERTY_PURPOSE_OPTIONS,
  },
  {
    id: 'propertyType',
    title: 'What type of property are you buying?',
    type: 'choice',
    options: PROPERTY_TYPE_OPTIONS,
  },
  {
    id: 'downPaymentRange',
    title: 'How much do you have available for down payment?',
    type: 'choice',
    options: DOWN_RANGE_OPTIONS,
  },
  {
    id: 'incomeType',
    title: 'What type of income do you have?',
    type: 'choice',
    options: INCOME_TYPE_OPTIONS,
  },

  /* ---- W-2 branch ---- */
  {
    id: 'w2Income',
    title: 'What was your approximate gross income last year before taxes?',
    helper: 'This is usually the total income on your W-2 before taxes are taken out.',
    type: 'numeric',
    show: (a) => a.incomeType === 'w2',
  },
  {
    id: 'w2IncomeTrend',
    title: 'Is your current income about the same, higher, or lower than last year?',
    type: 'choice',
    options: W2_TREND_OPTIONS,
    show: (a) => a.incomeType === 'w2',
  },

  /* ---- Self-employed branch ---- */
  {
    id: 'seReportedIncome',
    title: 'After your business expenses and write-offs, about how much income did you report on your tax return last year?',
    helper: 'This is not your gross sales. We are trying to estimate the income left after business expenses and deductions. A rough estimate is okay.',
    type: 'choice',
    options: SE_REPORTED_OPTIONS,
    show: isSelfEmployedAnswer,
  },
  {
    id: 'seWriteOffs',
    title: 'Do you usually write off a lot of expenses on your tax return?',
    type: 'choice',
    options: SE_WRITEOFF_OPTIONS,
    show: isSelfEmployedAnswer,
  },
  {
    id: 'seTaxesPaid',
    title: 'Do you remember roughly how much you paid in federal income taxes last year?',
    helper: 'This does not need to be exact. It helps us estimate whether your tax return may show enough income for FHA or Conventional financing.',
    type: 'choice',
    options: SE_TAXES_OPTIONS,
    show: isSelfEmployedAnswer,
  },

  /* ---- Credit & co-borrower ---- */
  {
    id: 'creditScore',
    title: 'What is your estimated credit score?',
    type: 'choice',
    options: CREDIT_OPTIONS,
  },
  {
    id: 'coBorrower',
    title: 'Are you buying alone or with another borrower?',
    type: 'choice',
    options: COBORROWER_OPTIONS,
  },

  /* ---- Income / debts / cash / price ---- */
  {
    id: 'monthlyIncome',
    title: 'How much is your gross monthly income?',
    helper: 'If your loan will use asset-based or foreign-national documentation, you can enter $0 and continue.',
    type: 'numeric',
    allowZero: true,
  },
  {
    id: 'monthlyDebts',
    title: 'How much do you pay monthly in debts?',
    helper: 'Include car payments, credit cards, student loans, personal loans, child support, and other recurring debts.',
    type: 'numeric',
    allowZero: true,
  },
  {
    id: 'availableCash',
    title: 'How much cash do you have available total for down payment and closing costs?',
    type: 'numeric',
  },
  {
    id: 'purchasePrice',
    title: 'What purchase price are you considering?',
    type: 'numeric',
  },
  {
    id: 'downPaymentInput',
    title: 'How much are you planning to put down?',
    type: 'downPayment',
  },

  /* ---- Taxes ---- */
  {
    id: 'knowsTaxes',
    title: 'Do you know the estimated annual property taxes?',
    type: 'choice',
    options: YES_NO_KNOW,
  },
  {
    id: 'annualTaxes',
    title: 'What are the estimated annual property taxes?',
    type: 'numeric',
    show: (a) => a.knowsTaxes === 'yes',
  },

  /* ---- Insurance / HO-6 ---- */
  {
    id: 'knowsInsurance',
    title: 'Do you know the estimated annual homeowners insurance?',
    type: 'choice',
    options: YES_NO_KNOW,
    show: (a) => a.propertyType !== 'condo',
  },
  {
    id: 'annualInsurance',
    title: 'What is the estimated annual homeowners insurance premium?',
    type: 'numeric',
    show: (a) => a.propertyType !== 'condo' && a.knowsInsurance === 'yes',
  },
  {
    id: 'knowsHO6',
    title: 'Do you know the annual HO-6 condo insurance premium?',
    type: 'choice',
    options: YES_NO_KNOW,
    show: (a) => a.propertyType === 'condo',
  },
  {
    id: 'annualHO6',
    title: 'What is the estimated annual HO-6 condo insurance premium?',
    type: 'numeric',
    show: (a) => a.propertyType === 'condo' && a.knowsHO6 === 'yes',
  },

  /* ---- HOA ---- */
  {
    id: 'hasHOA',
    title: 'Does the property have an HOA or condo association fee?',
    type: 'choice',
    options: HOA_OPTIONS,
  },
  {
    id: 'monthlyHOA',
    title: 'What is the estimated monthly HOA or condo fee?',
    type: 'numeric',
    show: (a) => a.hasHOA === 'yes',
  },

  /* ---- Investment rent ---- */
  {
    id: 'estimatedRent',
    title: 'What is the estimated monthly rent for the property?',
    helper: 'This is used to estimate whether the property’s rent may cover the loan payment (DSCR ratio).',
    type: 'numeric',
    show: (a) => a.propertyPurpose === 'investment',
  },
];

/* ---------- Initial answers ---------- */

const initialAnswers = {
  immigrationStatus: '',
  propertyPurpose: '',
  propertyType: '',
  downPaymentRange: '',
  incomeType: '',
  w2Income: '',
  w2IncomeTrend: '',
  seReportedIncome: '',
  seWriteOffs: '',
  seTaxesPaid: '',
  creditScore: '',
  coBorrower: '',
  monthlyIncome: '',
  monthlyDebts: '',
  availableCash: '',
  purchasePrice: '',
  downPaymentPercent: '',
  downPaymentDollar: '',
  knowsTaxes: '',
  annualTaxes: '',
  knowsInsurance: '',
  annualInsurance: '',
  knowsHO6: '',
  annualHO6: '',
  hasHOA: '',
  monthlyHOA: '',
  estimatedRent: '',
};

/* ---------- Active question list (filtered by `show`) ---------- */

function getActiveQuestions(answers) {
  return QUESTIONS.filter((q) => !q.show || q.show(answers));
}

/* ---------- Whether the current question's value is sufficient to advance ---------- */

function answerReady(question, answers) {
  if (question.type === 'choice') {
    return !!answers[question.id];
  }
  if (question.type === 'numeric') {
    const v = answers[question.id];
    if (question.allowZero) return v !== '' && v !== null && !isNaN(Number(v));
    return Number(v) > 0;
  }
  if (question.type === 'downPayment') {
    const pct = Number(answers.downPaymentPercent);
    const dol = Number(answers.downPaymentDollar);
    return pct > 0 || dol > 0;
  }
  return false;
}

/* ---------- Build internal advisor summary string ---------- */

function buildAdvisorSummary(answers, evals, contact) {
  const labelOf = (opts, val) => (opts.find((o) => o.value === val) || {}).label || val || '—';
  const dnPct = E.downPaymentPct(answers);
  const dnDollar = F.downPaymentDollar(answers);
  const taxesUsed =
    answers.knowsTaxes === 'yes' && Number(answers.annualTaxes) > 0
      ? `Borrower input: $${Number(answers.annualTaxes).toLocaleString()}/yr`
      : `Default 1.50% of price (~$${Math.round((Number(answers.purchasePrice) || 0) * window.CONFIG.defaults.annualPropertyTaxPct).toLocaleString()}/yr)`;
  const insUsed = (() => {
    if (answers.propertyType === 'condo') {
      return answers.knowsHO6 === 'yes' && Number(answers.annualHO6) > 0
        ? `Condo HO-6 input: $${Number(answers.annualHO6).toLocaleString()}/yr`
        : `Default condo HO-6 ~$${window.CONFIG.defaults.monthlyHO6}/mo`;
    }
    return answers.knowsInsurance === 'yes' && Number(answers.annualInsurance) > 0
      ? `Borrower input: $${Number(answers.annualInsurance).toLocaleString()}/yr`
      : `Default 0.80% of price (~$${Math.round((Number(answers.purchasePrice) || 0) * window.CONFIG.defaults.annualHomeownersInsPct).toLocaleString()}/yr)`;
  })();
  const hoaUsed =
    answers.hasHOA === 'yes' && Number(answers.monthlyHOA) > 0
      ? `Borrower input: $${Number(answers.monthlyHOA).toLocaleString()}/mo`
      : answers.hasHOA === 'unknown'
        ? 'Unknown — used $0 for estimate'
        : '$0';

  const eligible = evals.filter((p) => p.eligible);
  const ruled = evals.filter((p) => !p.eligible);

  const eligibleLines = eligible.map((p) => {
    const calc = F.computeProgramPayment(p.key, answers);
    const rate = calc.rate != null ? (calc.rate * 100).toFixed(3) + '%' : '—';
    return [
      `  - ${p.name}${p.manualReview ? ' (MANUAL REVIEW)' : ''}`,
      `      Illustrative rate: ${rate}`,
      `      Loan amount: $${Math.round(calc.loanAmount).toLocaleString()}`,
      `      P&I: $${Math.round(calc.principalAndInterest).toLocaleString()}/mo`,
      `      MI/PMI: $${Math.round(calc.monthlyMi).toLocaleString()}/mo${calc.upfrontMip > 0 ? `  (upfront $${Math.round(calc.upfrontMip).toLocaleString()})` : ''}`,
      `      Taxes: $${Math.round(calc.monthlyTaxes).toLocaleString()}/mo`,
      `      Insurance: $${Math.round(calc.monthlyInsurance).toLocaleString()}/mo`,
      `      HOA: $${Math.round(calc.monthlyHOA).toLocaleString()}/mo`,
      `      Total PITI(A): $${Math.round(calc.totalMonthly).toLocaleString()}/mo`,
      `      Borrower-facing range: $${Math.round(calc.paymentRange.low).toLocaleString()} – $${Math.round(calc.paymentRange.high).toLocaleString()}/mo`,
      `      Total cash needed est.: $${Math.round(calc.totalCashNeeded).toLocaleString()}`,
    ].join('\n');
  }).join('\n');

  const ruledLines = ruled.map((p) =>
    `  - ${p.name}: ${p.blockers.join('; ')}`
  ).join('\n');

  const dscrLine = (() => {
    if (answers.propertyPurpose !== 'investment') return '';
    const ratio = F.dscrRatio(answers);
    if (ratio == null) return '\nDSCR ratio: rent not provided';
    return `\nDSCR ratio: ${ratio.toFixed(2)} (rent $${Number(answers.estimatedRent || 0).toLocaleString()} / DSCR PITIA)`;
  })();

  const dti = (() => {
    if (eligible.length === 0) return '';
    const calc = F.computeProgramPayment(eligible[0].key, answers);
    const front = F.frontEndDti(answers, calc.totalMonthly);
    const back = F.backEndDti(answers, calc.totalMonthly);
    if (front == null) return '';
    return `\nFront-end DTI (using ${eligible[0].name}): ${(front * 100).toFixed(1)}%` +
           (back != null ? ` | Back-end DTI: ${(back * 100).toFixed(1)}%` : '');
  })();

  const followUps = [
    '- Confirm immigration documentation',
    '- Confirm SSN vs ITIN',
    '- Confirm whether tax returns show enough income',
    '- Ask if borrower writes off significant expenses',
    '- Ask whether bank statements or P&L better reflect income',
    '- Confirm down payment funds and reserves',
    '- Confirm property type and HOA',
    '- Confirm estimated taxes and insurance',
    '- Confirm credit before quoting any actual rate',
    answers.propertyPurpose === 'investment' ? '- Confirm market rent and DSCR ratio' : null,
  ].filter(Boolean).join('\n');

  return [
    '=========================================',
    'INTERNAL MORTGAGE ADVISOR LEAD SUMMARY',
    '=========================================',
    contact ? `Contact: ${contact.name} | ${contact.phone || '—'} | ${contact.email || '—'}` : 'Contact: (not yet submitted)',
    contact ? `Preferred: ${contact.preferredContact} | Best time: ${contact.bestTime || '—'}` : '',
    contact && contact.message ? `Message: ${contact.message}` : '',
    '',
    '--- Borrower profile ---',
    `Immigration: ${labelOf(IMMIGRATION_OPTIONS, answers.immigrationStatus)}`,
    `Property purpose: ${labelOf(PROPERTY_PURPOSE_OPTIONS, answers.propertyPurpose)}`,
    `Property type: ${labelOf(PROPERTY_TYPE_OPTIONS, answers.propertyType)}`,
    `Down payment range (initial): ${labelOf(DOWN_RANGE_OPTIONS, answers.downPaymentRange)}`,
    `Down payment entered: ${(dnPct * 100).toFixed(2)}% ($${Math.round(dnDollar).toLocaleString()})`,
    `Income type: ${labelOf(INCOME_TYPE_OPTIONS, answers.incomeType)}`,
    answers.incomeType === 'w2'
      ? `W-2 last year: $${Number(answers.w2Income || 0).toLocaleString()} | Trend: ${labelOf(W2_TREND_OPTIONS, answers.w2IncomeTrend)}`
      : '',
    isSelfEmployedAnswer(answers)
      ? `Self-employed reported income: ${labelOf(SE_REPORTED_OPTIONS, answers.seReportedIncome)} | Write-offs: ${labelOf(SE_WRITEOFF_OPTIONS, answers.seWriteOffs)} | Taxes paid: ${labelOf(SE_TAXES_OPTIONS, answers.seTaxesPaid)} | Strength: ${E.selfEmployedTaxReturnStrength(answers)}`
      : '',
    `Credit score bracket: ${labelOf(CREDIT_OPTIONS, answers.creditScore)}`,
    `Co-borrower: ${labelOf(COBORROWER_OPTIONS, answers.coBorrower)}`,
    `Monthly income: $${Number(answers.monthlyIncome || 0).toLocaleString()}`,
    `Monthly debts: $${Number(answers.monthlyDebts || 0).toLocaleString()}`,
    `Available cash: $${Number(answers.availableCash || 0).toLocaleString()}`,
    `Purchase price: $${Number(answers.purchasePrice || 0).toLocaleString()}`,
    `Property taxes: ${taxesUsed}`,
    `Insurance: ${insUsed}`,
    `HOA: ${hoaUsed}`,
    answers.propertyPurpose === 'investment'
      ? `Estimated rent: $${Number(answers.estimatedRent || 0).toLocaleString()}/mo`
      : '',
    dti,
    dscrLine,
    '',
    '--- Possible programs ---',
    eligible.length > 0 ? eligibleLines : '  (none)',
    '',
    '--- Programs ruled out ---',
    ruled.length > 0 ? ruledLines : '  (none)',
    '',
    '--- Suggested follow-ups ---',
    followUps,
  ].filter((x) => x !== '').join('\n');
}

/* =========================================================================
 * Main App
 * ========================================================================= */

function App() {
  const [stage, setStage] = useState('landing'); // landing | quiz | results | thankyou
  const [answers, setAnswers] = useState(initialAnswers);
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [contact, setContact] = useState(null);

  const activeQuestions = useMemo(() => getActiveQuestions(answers), [answers]);
  const currentQuestion = activeQuestions[stepIndex];

  const update = (id, value) => setAnswers((a) => ({ ...a, [id]: value }));

  const goNext = () => {
    if (!currentQuestion) return;
    if (stepIndex + 1 >= activeQuestions.length) {
      setStage('results');
      return;
    }
    setStepIndex(stepIndex + 1);
  };

  const goBack = () => {
    if (stepIndex === 0) {
      setStage('landing');
      return;
    }
    setStepIndex(stepIndex - 1);
  };

  const restart = () => {
    setAnswers(initialAnswers);
    setStepIndex(0);
    setStage('landing');
    setContact(null);
  };

  /* ---- Render ---- */
  if (stage === 'landing') {
    return (
      <div className="min-h-screen">
        <Comp.TopBar showRestart={false} />
        <Comp.Landing onStart={() => { setStage('quiz'); setStepIndex(0); }} />
      </div>
    );
  }

  if (stage === 'thankyou') {
    return (
      <div className="min-h-screen">
        <Comp.TopBar showRestart={false} />
        <Comp.ThankYou onRestart={restart} />
      </div>
    );
  }

  if (stage === 'quiz') {
    if (!currentQuestion) {
      // safety: jump to results
      setStage('results');
      return null;
    }
    return (
      <div className="min-h-screen">
        <Comp.TopBar showRestart onRestart={restart} />
        <Comp.ProgressBar current={stepIndex} total={activeQuestions.length} />
        <Comp.QuestionStep
          title={currentQuestion.title}
          helper={currentQuestion.helper}
          onBack={goBack}
          canBack
          onNext={currentQuestion.type === 'choice' ? null : goNext}
          canNext={answerReady(currentQuestion, answers)}
          nextLabel={stepIndex + 1 >= activeQuestions.length ? 'See my results' : 'Continue'}
        >
          {currentQuestion.type === 'choice' && (
            <Comp.MultipleChoiceQuestion
              value={answers[currentQuestion.id]}
              options={currentQuestion.options}
              onSelect={(v) => {
                const nextAnswers = { ...answers, [currentQuestion.id]: v };
                setAnswers(nextAnswers);
                // Auto-advance shortly after selection so users see the
                // confirmation highlight before the screen changes.
                setTimeout(() => {
                  const newActive = getActiveQuestions(nextAnswers);
                  if (stepIndex + 1 >= newActive.length) {
                    setStage('results');
                  } else {
                    setStepIndex(stepIndex + 1);
                  }
                }, 150);
              }}
            />
          )}
          {currentQuestion.type === 'numeric' && (
            <Comp.NumericInputQuestion
              value={answers[currentQuestion.id]}
              onChange={(v) => update(currentQuestion.id, v)}
              placeholder="0"
            />
          )}
          {currentQuestion.type === 'downPayment' && (
            <Comp.DownPaymentQuestion
              purchasePrice={answers.purchasePrice}
              downPercent={answers.downPaymentPercent}
              downDollar={answers.downPaymentDollar}
              onChangePercent={(v) => update('downPaymentPercent', v)}
              onChangeDollar={(v) => update('downPaymentDollar', v)}
            />
          )}
        </Comp.QuestionStep>

        {currentQuestion.id === 'monthlyHOA' && answers.hasHOA === 'unknown' && (
          <div className="max-w-2xl mx-auto px-4">
            <div className="text-xs text-slate-500 -mt-4">
              Note: {window.CONFIG.disclaimers.hoaUnknown}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ---- Results stage ---- */
  const evals = E.evaluateAll(answers);
  const eligible = evals.filter((p) => p.eligible);
  const ruled = evals.filter((p) => !p.eligible);
  const summary = buildAdvisorSummary(answers, evals, contact);
  const dscrInfo = answers.propertyPurpose === 'investment'
    ? { ratio: F.dscrRatio(answers) }
    : null;

  const handleSubmitContact = (form) => {
    setSubmitting(true);
    setContact(form);
    // No backend wired yet — just print to console for the advisor to review.
    // The advisor can also copy the summary card on the results page.
    console.log('--- LEAD SUBMITTED ---');
    console.log(form);
    console.log(buildAdvisorSummary(answers, evals, form));
    setTimeout(() => {
      setSubmitting(false);
      setStage('thankyou');
    }, 500);
  };

  return (
    <div className="min-h-screen">
      <Comp.TopBar showRestart onRestart={restart} />

      <div className="max-w-2xl mx-auto px-4 pt-6 pb-24">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-sm">
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">Your estimated mortgage options</h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">{window.CONFIG.disclaimers.results}</p>
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {window.CONFIG.disclaimers.noCreditPull}
          </div>
        </div>

        {/* Eligible programs */}
        <div className="mt-5 grid gap-4">
          {eligible.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-amber-900">
              Based on your answers, we couldn’t auto-match a standard program. A mortgage advisor
              can still review your situation manually — many borrowers fit programs that need a
              human review beyond what this tool can match.
            </div>
          )}
          {eligible.map((p) => {
            const calc = F.computeProgramPayment(p.key, answers);
            return (
              <Comp.ProgramResultCard
                key={p.key}
                program={p}
                calc={calc}
                dscrInfo={p.key === 'dscr' ? dscrInfo : null}
              />
            );
          })}
        </div>

        {/* Ruled-out programs */}
        {ruled.length > 0 && (
          <div className="mt-6">
            <h3 className="text-base font-semibold text-slate-900 mb-2">
              Programs that may not fit based on your answers
            </h3>
            <div className="grid gap-2">
              {ruled.map((p) => <Comp.RuledOutCard key={p.key} program={p} />)}
            </div>
          </div>
        )}

        {/* Contact form */}
        <div className="mt-6">
          <Comp.ContactForm onSubmit={handleSubmitContact} submitting={submitting} />
        </div>

        {/* Internal advisor summary (hidden by default) */}
        <div className="mt-6">
          <Comp.AdvisorSummary summary={summary} />
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

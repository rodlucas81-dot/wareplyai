/* =========================================================================
 * components.js — Reusable React components.
 *
 * Exposed globally as window.Components.
 * ========================================================================= */

const { useState, useMemo, useEffect } = React;

const cx = (...xs) => xs.filter(Boolean).join(' ');

/* ---------- Branding bar ---------- */
function TopBar({ onRestart, showRestart }) {
  return (
    <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center text-sm font-bold">M</div>
          <div className="text-sm font-semibold text-slate-900">Mortgage Fit Estimator</div>
        </div>
        {showRestart && (
          <button
            onClick={onRestart}
            className="text-xs text-slate-500 hover:text-slate-700"
          >Start over</button>
        )}
      </div>
    </div>
  );
}

/* ---------- Progress bar ---------- */
function ProgressBar({ current, total }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="px-4 pt-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>Question {Math.min(current + 1, total)} of {total}</span>
          <span>{pct}%</span>
        </div>
        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-slate-900 transition-all duration-300"
            style={{ width: pct + '%' }}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------- Landing page ---------- */
function Landing({ onStart }) {
  const D = window.CONFIG.disclaimers;
  return (
    <div className="max-w-2xl mx-auto px-4 pt-10 pb-16">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium mb-4">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          No credit pull · Estimate only
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
          Find out which mortgage options may fit you — without pulling your credit.
        </h1>
        <p className="mt-3 text-slate-600 leading-relaxed">
          This tool gives you a rough estimate based on the information you provide.
          It is not a mortgage application, not a loan approval, and not a guaranteed rate quote.
        </p>

        <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="font-semibold text-slate-900 text-sm">{D.noCreditPull}</div>
        </div>

        <button
          onClick={onStart}
          className="mt-6 w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-4 rounded-xl text-base transition-colors"
        >
          Start Estimate
        </button>

        <p className="mt-3 text-xs text-slate-500 text-center">{D.illustrationOnly}</p>
      </div>
    </div>
  );
}

/* ---------- Card wrapper used for each question ---------- */
function QuestionStep({ title, helper, children, onBack, canBack, onNext, canNext, nextLabel }) {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-24">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-7">
        <h2 className="text-xl md:text-2xl font-semibold text-slate-900 leading-snug">{title}</h2>
        {helper && <p className="mt-2 text-sm text-slate-500">{helper}</p>}
        <div className="mt-5">{children}</div>
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={onBack}
            disabled={!canBack}
            className={cx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              canBack ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 cursor-not-allowed'
            )}
          >← Back</button>
          {onNext && (
            <button
              onClick={onNext}
              disabled={!canNext}
              className={cx(
                'px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors',
                canNext ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              )}
            >{nextLabel || 'Continue'}</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Multiple choice (large buttons) ---------- */
function MultipleChoiceQuestion({ value, options, onSelect }) {
  return (
    <div className="grid gap-2">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            className={cx(
              'text-left w-full p-4 rounded-xl border-2 transition-all',
              active
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 hover:border-slate-400 bg-white text-slate-800'
            )}
          >
            <div className="text-sm md:text-base font-medium">{opt.label}</div>
            {opt.sub && (
              <div className={cx('text-xs mt-1', active ? 'text-slate-300' : 'text-slate-500')}>
                {opt.sub}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Numeric input (currency) ---------- */
function NumericInputQuestion({ value, onChange, placeholder, prefix = '$', suffix }) {
  const display = value === '' || value == null ? '' : Number(value).toLocaleString('en-US');
  return (
    <div className="flex items-center gap-2">
      {prefix && <span className="text-xl text-slate-500">{prefix}</span>}
      <input
        type="text"
        inputMode="numeric"
        value={display}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, '');
          onChange(raw === '' ? '' : Number(raw));
        }}
        className="w-full text-xl md:text-2xl font-semibold border-0 border-b-2 border-slate-200 focus:border-slate-900 outline-none px-1 py-2 bg-transparent"
      />
      {suffix && <span className="text-base text-slate-500">{suffix}</span>}
    </div>
  );
}

/* ---------- Down-payment input (% or $) ---------- */
function DownPaymentQuestion({ purchasePrice, downPercent, downDollar, onChangePercent, onChangeDollar }) {
  const [mode, setMode] = useState('percent');
  const price = Number(purchasePrice) || 0;

  const derivedDollar = (() => {
    if (mode === 'percent' && downPercent !== '' && price > 0) {
      return Math.round((Number(downPercent) / 100) * price);
    }
    return Number(downDollar) || 0;
  })();

  const derivedPercent = (() => {
    if (mode === 'dollar' && downDollar !== '' && price > 0) {
      return ((Number(downDollar) / price) * 100).toFixed(1);
    }
    return Number(downPercent) || 0;
  })();

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMode('percent')}
          className={cx(
            'flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all',
            mode === 'percent' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'
          )}
        >Percentage</button>
        <button
          onClick={() => setMode('dollar')}
          className={cx(
            'flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all',
            mode === 'dollar' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'
          )}
        >Dollar amount</button>
      </div>

      {mode === 'percent' ? (
        <NumericInputQuestion
          value={downPercent}
          onChange={(v) => {
            onChangePercent(v);
            if (price > 0 && v !== '') onChangeDollar(Math.round((Number(v) / 100) * price));
          }}
          placeholder="0"
          prefix=""
          suffix="%"
        />
      ) : (
        <NumericInputQuestion
          value={downDollar}
          onChange={(v) => {
            onChangeDollar(v);
            if (price > 0 && v !== '') onChangePercent(((Number(v) / price) * 100).toFixed(1));
          }}
          placeholder="0"
        />
      )}

      <div className="mt-4 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
        {mode === 'percent'
          ? <>That’s about <strong>${derivedDollar.toLocaleString()}</strong> down on a ${price.toLocaleString()} price.</>
          : <>That’s about <strong>{derivedPercent}%</strong> down on a ${price.toLocaleString()} price.</>}
      </div>
    </div>
  );
}

/* ---------- Result program card (borrower-facing) ---------- */
function ProgramResultCard({ program, calc, dscrInfo }) {
  const C = window.CONFIG;
  const F = window.Calculations;
  const label = C.pricingLabels[program.manualReview ? 'manual' : program.pricingCategory];
  const showRate = C.display.showRatesToBorrower && calc.rate != null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">May fit</div>
          <h3 className="text-lg md:text-xl font-bold text-slate-900 mt-1">{program.name}</h3>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Pricing category</div>
          <div className="text-sm font-semibold text-slate-900">{label}</div>
        </div>
      </div>

      {program.reasons.length > 0 && (
        <ul className="mt-3 text-sm text-slate-600 space-y-1">
          {program.reasons.map((r, i) => <li key={i}>• {r}</li>)}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Estimated payment range" value={`${F.fmtMoney(calc.paymentRange.low)} – ${F.fmtMoney(calc.paymentRange.high)}/mo`} />
        <Stat label="Min down payment" value={`${(calc.downPaymentPct * 100).toFixed(1)}%`} />
        <Stat label="Estimated mortgage insurance" value={calc.monthlyMi > 0 ? `${F.fmtMoney(calc.monthlyMi)}/mo` : 'None'} />
        {calc.upfrontMip > 0 && (
          <Stat label="Upfront mortgage insurance" value={F.fmtMoney(calc.upfrontMip)} />
        )}
        <Stat label="Estimated total cash needed" value={F.fmtMoney(calc.totalCashNeeded)} />
        {showRate && <Stat label="Illustrative rate" value={F.fmtPct(calc.rate, 3)} />}
      </div>

      {dscrInfo && (
        <div className="mt-4 p-3 rounded-lg bg-slate-50 text-sm text-slate-700">
          <div className="font-semibold mb-1">DSCR estimate</div>
          {dscrInfo.ratio != null
            ? (dscrInfo.ratio >= 1.0
                ? `Estimated DSCR ratio: ${dscrInfo.ratio.toFixed(2)}. Based on the estimated rent, the property may fit a DSCR structure, subject to lender guidelines.`
                : `Estimated DSCR ratio: ${dscrInfo.ratio.toFixed(2)}. Based on the estimated rent, the property may not fully cover the payment. DSCR may still be possible with a larger down payment, better rate, lower purchase price, or a lender exception.`)
            : 'Add an estimated monthly rent to see the DSCR ratio.'}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        {window.CONFIG.disclaimers.paymentRange}
      </p>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}

/* ---------- Ruled-out program card ---------- */
function RuledOutCard({ program }) {
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-slate-700">{program.name}</div>
        <div className="text-xs text-slate-500">May not fit</div>
      </div>
      <ul className="mt-2 text-sm text-slate-600 space-y-1">
        {program.blockers.map((b, i) => <li key={i}>• {b}</li>)}
      </ul>
    </div>
  );
}

/* ---------- Contact form ---------- */
function ContactForm({ onSubmit, submitting }) {
  const [form, setForm] = useState({
    name: '', phone: '', email: '',
    preferredContact: 'phone', bestTime: '', message: '',
  });
  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.name.trim() && (form.phone.trim() || form.email.trim());

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-sm">
      <h3 className="text-xl font-bold text-slate-900">Want a full review?</h3>
      <p className="text-sm text-slate-600 mt-1">
        Send your answers to a mortgage advisor. {window.CONFIG.disclaimers.noCreditPull}
      </p>

      <div className="mt-4 grid gap-3">
        <Field label="Name" value={form.name} onChange={(v) => update('name', v)} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Phone" value={form.phone} onChange={(v) => update('phone', v)} />
          <Field label="Email" value={form.email} onChange={(v) => update('email', v)} />
        </div>
        <div>
          <div className="text-xs font-medium text-slate-600 mb-1">Preferred contact method</div>
          <div className="flex gap-2">
            {[
              { v: 'phone', l: 'Phone' },
              { v: 'text', l: 'Text' },
              { v: 'email', l: 'Email' },
            ].map(({ v, l }) => (
              <button
                key={v}
                onClick={() => update('preferredContact', v)}
                className={cx(
                  'flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all',
                  form.preferredContact === v
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 text-slate-700'
                )}
              >{l}</button>
            ))}
          </div>
        </div>
        <Field label="Best time to call" value={form.bestTime} onChange={(v) => update('bestTime', v)} />
        <Field label="Optional message" value={form.message} onChange={(v) => update('message', v)} multiline />
      </div>

      <p className="mt-4 text-xs text-slate-500">{window.CONFIG.disclaimers.contactConsent}</p>

      <button
        onClick={() => valid && onSubmit(form)}
        disabled={!valid || submitting}
        className={cx(
          'mt-4 w-full py-3.5 rounded-xl font-semibold transition-colors',
          valid && !submitting
            ? 'bg-slate-900 text-white hover:bg-slate-800'
            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
        )}
      >{submitting ? 'Sending…' : 'Send my results for review'}</button>
    </div>
  );
}

function Field({ label, value, onChange, multiline }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-600 mb-1">{label}</div>
      {multiline ? (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 outline-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 outline-none"
        />
      )}
    </div>
  );
}

/* ---------- Internal advisor summary (collapsible) ---------- */
function AdvisorSummary({ summary }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-slate-300 border-dashed p-5 md:p-6">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Internal use</div>
          <div className="font-semibold text-slate-900">Mortgage advisor lead summary</div>
        </div>
        <span className="text-slate-500 text-sm">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <pre className="mt-4 whitespace-pre-wrap text-xs leading-relaxed text-slate-700 bg-slate-50 p-3 rounded-lg overflow-x-auto">
{summary}
        </pre>
      )}
    </div>
  );
}

/* ---------- Thank you page ---------- */
function ThankYou({ onRestart }) {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-10 pb-16">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center text-xl">✓</div>
        <h2 className="mt-4 text-2xl font-bold text-slate-900">Thank you</h2>
        <p className="mt-2 text-slate-600">{window.CONFIG.disclaimers.thankYou}</p>
        <button
          onClick={onRestart}
          className="mt-6 px-6 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
        >Start a new estimate</button>
      </div>
    </div>
  );
}

window.Components = {
  TopBar, ProgressBar, Landing, QuestionStep,
  MultipleChoiceQuestion, NumericInputQuestion, DownPaymentQuestion,
  ProgramResultCard, RuledOutCard, ContactForm, AdvisorSummary, ThankYou,
};

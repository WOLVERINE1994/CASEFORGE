"use client";

import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";

type SignupForm = {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  password: string;
  confirmPassword: string;
  dateOfBirth: string;
  gender: string;
  skinProfile: string;
  beautyInterest: string;
  referralCode: string;
  address: string;
  newsletter: boolean;
  terms: boolean;
};

const initialForm: SignupForm = {
  address: "",
  beautyInterest: "",
  confirmPassword: "",
  dateOfBirth: "",
  email: "",
  firstName: "",
  gender: "",
  lastName: "",
  mobile: "",
  newsletter: false,
  password: "",
  referralCode: "",
  skinProfile: "",
  terms: false,
};

const products = [
  { name: "Rose Beam Lip Tint", shade: "Petal red", price: "$18" },
  { name: "Cloud Skin Primer", shade: "Soft matte", price: "$24" },
  { name: "Lumen Highlighter", shade: "Champagne", price: "$21" },
  { name: "Velvet Kajal Stick", shade: "Midnight", price: "$15" },
];

function validateForm(form: SignupForm) {
  const errors: Partial<Record<keyof SignupForm, string>> = {};
  if (!form.firstName.trim()) errors.firstName = "First name is required.";
  if (!form.lastName.trim()) errors.lastName = "Last name is required.";
  if (!form.email.trim()) errors.email = "Email is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = "Enter a valid email address.";
  if (!form.mobile.trim()) errors.mobile = "Mobile number is required.";
  else if (form.mobile.replace(/\D/g, "").length < 10) errors.mobile = "Mobile number must be at least 10 digits.";
  if (!form.password) errors.password = "Password is required.";
  if (!form.confirmPassword) errors.confirmPassword = "Confirm password is required.";
  else if (form.password !== form.confirmPassword) errors.confirmPassword = "Passwords do not match.";
  if (!form.dateOfBirth) errors.dateOfBirth = "Date of birth is required.";
  if (!form.gender) errors.gender = "Gender is required.";
  if (!form.skinProfile) errors.skinProfile = "Skin profile is required.";
  if (!form.terms) errors.terms = "Accept the terms and privacy policy to continue.";
  return errors;
}

export default function GlowCartDemoPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [form, setForm] = useState<SignupForm>(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submittedName, setSubmittedName] = useState("");
  const [touched, setTouched] = useState(false);

  const errors = useMemo(() => (touched ? validateForm(form) : {}), [form, touched]);
  const hasErrors = Object.keys(errors).length > 0;

  const updateField = <K extends keyof SignupForm>(key: K, value: SignupForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submitSignup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    const nextErrors = validateForm(form);
    if (Object.keys(nextErrors).length) return;
    setSubmittedName(`${form.firstName} ${form.lastName}`.trim());
    setFormOpen(false);
    setForm(initialForm);
    setTouched(false);
  };

  return (
    <main className="min-h-screen bg-[#f8fbf7] text-[#172117]">
      <header className="sticky top-0 z-10 border-b border-[#dbe8d6] bg-[#f8fbf7]/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4d7c62]">GlowCart</p>
            <h1 className="text-xl font-semibold">Makeup essentials for everyday glow</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setFormOpen(true);
            }}
            className="rounded-lg bg-[#0f7b5f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0a644e]"
          >
            Create Account
          </button>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4 sm:grid-cols-2">
          {products.map((product) => (
            <article key={product.name} className="rounded-lg border border-[#dbe8d6] bg-white p-4 shadow-sm">
              <div className="flex h-36 items-end rounded-lg bg-[linear-gradient(135deg,#ffe2e7,#f5f2c8_52%,#d2efe1)] p-4">
                <span className="rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-[#174235]">
                  {product.shade}
                </span>
              </div>
              <div className="mt-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{product.name}</h2>
                  <p className="mt-1 text-sm text-[#5f7165]">Dermatologist tested, vegan friendly.</p>
                </div>
                <p className="font-semibold text-[#0f7b5f]">{product.price}</p>
              </div>
            </article>
          ))}
        </div>

        <aside className="rounded-lg border border-[#dbe8d6] bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Member perks</h2>
          <div className="mt-3 space-y-3 text-sm text-[#526458]">
            <p>Save shade matches, order faster, and receive skin-profile recommendations.</p>
            {submittedName ? (
              <div role="status" className="rounded-lg border border-[#91d2b4] bg-[#e9f8ef] p-3 font-semibold text-[#14553f]">
                Account created for {submittedName}.
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setFormOpen(true);
              }}
              className="w-full rounded-lg border border-[#0f7b5f] px-4 py-2 font-semibold text-[#0f7b5f] hover:bg-[#e9f8ef]"
            >
              Join GlowCart
            </button>
          </div>
        </aside>
      </section>

      {formOpen ? (
        <div className="fixed inset-0 z-20 overflow-y-auto bg-black/45 px-4 py-6">
          <div className="mx-auto max-w-3xl rounded-lg bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#e1eadc] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7c62]">
                  {mode === "signup" ? "Create Account" : "Sign In"}
                </p>
                <h2 className="mt-1 text-lg font-semibold">
                  {mode === "signup" ? "GlowCart signup form" : "Welcome back"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-[#5f7165] hover:bg-[#eef4eb]"
              >
                Close
              </button>
            </div>

            {mode === "signin" ? (
              <div className="px-5 py-5">
                <label className="block text-sm font-semibold">
                  Email Address
                  <input className="mt-1 w-full rounded-lg border border-[#bed0b7] px-3 py-2" type="email" />
                </label>
                <label className="mt-4 block text-sm font-semibold">
                  Password
                  <input className="mt-1 w-full rounded-lg border border-[#bed0b7] px-3 py-2" type="password" />
                </label>
                <button className="mt-5 rounded-lg bg-[#0f7b5f] px-4 py-2 font-semibold text-white" type="button">
                  Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={submitSignup} noValidate className="grid gap-4 px-5 py-5 sm:grid-cols-2">
                <Field label="First Name" required error={errors.firstName}>
                  <input value={form.firstName} onChange={(event) => updateField("firstName", event.target.value)} className="field" />
                </Field>
                <Field label="Last Name" required error={errors.lastName}>
                  <input value={form.lastName} onChange={(event) => updateField("lastName", event.target.value)} className="field" />
                </Field>
                <Field label="Email Address" required error={errors.email}>
                  <input value={form.email} onChange={(event) => updateField("email", event.target.value)} className="field" type="email" />
                </Field>
                <Field label="Mobile Number" required error={errors.mobile}>
                  <input value={form.mobile} onChange={(event) => updateField("mobile", event.target.value)} className="field" inputMode="numeric" />
                </Field>
                <Field label="Password" required error={errors.password}>
                  <div className="flex rounded-lg border border-[#bed0b7] bg-white">
                    <input value={form.password} onChange={(event) => updateField("password", event.target.value)} className="min-w-0 flex-1 rounded-l-lg px-3 py-2 outline-none" type={showPassword ? "text" : "password"} />
                    <button type="button" onClick={() => setShowPassword((value) => !value)} className="px-3 text-sm font-semibold text-[#0f7b5f]">
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </Field>
                <Field label="Confirm Password" required error={errors.confirmPassword}>
                  <div className="flex rounded-lg border border-[#bed0b7] bg-white">
                    <input value={form.confirmPassword} onChange={(event) => updateField("confirmPassword", event.target.value)} className="min-w-0 flex-1 rounded-l-lg px-3 py-2 outline-none" type={showConfirmPassword ? "text" : "password"} />
                    <button type="button" onClick={() => setShowConfirmPassword((value) => !value)} className="px-3 text-sm font-semibold text-[#0f7b5f]">
                      {showConfirmPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </Field>
                <Field label="Date of Birth" required error={errors.dateOfBirth}>
                  <input value={form.dateOfBirth} onChange={(event) => updateField("dateOfBirth", event.target.value)} className="field" type="date" />
                </Field>
                <Field label="Gender" required error={errors.gender}>
                  <select value={form.gender} onChange={(event) => updateField("gender", event.target.value)} className="field">
                    <option value="">Select gender</option>
                    <option>Female</option>
                    <option>Male</option>
                    <option>Non-binary</option>
                    <option>Prefer not to say</option>
                  </select>
                </Field>
                <Field label="Skin Profile" required error={errors.skinProfile}>
                  <select value={form.skinProfile} onChange={(event) => updateField("skinProfile", event.target.value)} className="field">
                    <option value="">Select skin profile</option>
                    <option>Oily</option>
                    <option>Dry</option>
                    <option>Combination</option>
                    <option>Sensitive</option>
                  </select>
                </Field>
                <Field label="Beauty Interest">
                  <select value={form.beautyInterest} onChange={(event) => updateField("beautyInterest", event.target.value)} className="field">
                    <option value="">Select interest</option>
                    <option>Skincare</option>
                    <option>Makeup</option>
                    <option>Fragrance</option>
                    <option>Hair care</option>
                  </select>
                </Field>
                <Field label="Referral Code">
                  <input value={form.referralCode} onChange={(event) => updateField("referralCode", event.target.value)} className="field" />
                </Field>
                <Field label="Address">
                  <textarea value={form.address} onChange={(event) => updateField("address", event.target.value)} className="field min-h-20" />
                </Field>
                <label className="flex items-start gap-3 rounded-lg border border-[#dbe8d6] p-3 text-sm font-semibold">
                  <input type="checkbox" checked={form.newsletter} onChange={(event) => updateField("newsletter", event.target.checked)} className="mt-1 h-4 w-4 accent-[#0f7b5f]" />
                  Newsletter checkbox
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-[#dbe8d6] p-3 text-sm font-semibold">
                  <input type="checkbox" checked={form.terms} onChange={(event) => updateField("terms", event.target.checked)} className="mt-1 h-4 w-4 accent-[#0f7b5f]" />
                  Terms and Privacy Policy checkbox *
                </label>
                {errors.terms ? <p role="alert" className="sm:col-span-2 text-sm font-semibold text-[#b42318]">{errors.terms}</p> : null}
                {hasErrors ? <p role="alert" className="sm:col-span-2 rounded-lg bg-[#fff1f0] p-3 text-sm font-semibold text-[#b42318]">Please fix the highlighted fields before creating your account.</p> : null}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1eadc] pt-4 sm:col-span-2">
                  <button type="button" onClick={() => setMode("signin")} className="text-sm font-semibold text-[#0f7b5f]">
                    Already have account? Sign in
                  </button>
                  <button type="submit" className="rounded-lg bg-[#0f7b5f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0a644e]">
                    Create Account
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
      <style jsx>{`
        .field {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #bed0b7;
          background: white;
          padding: 0.5rem 0.75rem;
          outline: none;
        }
        .field:focus {
          border-color: #0f7b5f;
          box-shadow: 0 0 0 3px rgba(15, 123, 95, 0.16);
        }
      `}</style>
    </main>
  );
}

function Field({
  children,
  error,
  label,
  required,
}: {
  children: ReactNode;
  error?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      {required ? <span className="text-[#b42318]"> *</span> : null}
      <span className="mt-1 block">{children}</span>
      {error ? <span role="alert" className="mt-1 block text-xs font-semibold text-[#b42318]">{error}</span> : null}
    </label>
  );
}

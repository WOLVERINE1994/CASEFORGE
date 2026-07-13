type SignatureDemoStaticPreviewProps = {
  eyebrow?: string;
  title: string;
  summary: string;
};

export default function SignatureDemoStaticPreview({
  eyebrow = "Signature Demo",
  summary,
  title,
}: SignatureDemoStaticPreviewProps) {
  return (
    <section className="cf-signature-demo cf-signature-static-preview">
      <div className="cf-signature-demo-header">
        <div>
          <p className="cf-marketing-eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="cf-demo-panel">
        <p>Static product preview</p>
        <h4>{summary}</h4>
        <div className="cf-signature-static-grid" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </section>
  );
}

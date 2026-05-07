// Tiny wrapper for <script type="application/ld+json"> tags. Server-rendered.
export function JsonLd({ value }: { value: unknown }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger -- JSON.stringify produces safe content
      dangerouslySetInnerHTML={{ __html: JSON.stringify(value) }}
    />
  );
}

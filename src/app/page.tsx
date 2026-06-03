export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="flex flex-col items-center text-center">
        <span
          role="img"
          aria-label="IMA Accelerator"
          className="block bg-ima-primary"
          style={{
            width: 288,
            height: 60,
            WebkitMaskImage: "url(/ima-logo.png)",
            maskImage: "url(/ima-logo.png)",
            WebkitMaskSize: "contain",
            maskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
          }}
        />
        <p className="mt-3 text-ima-text-secondary">Foundation setup complete</p>
      </div>
    </main>
  );
}

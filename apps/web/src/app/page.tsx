import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <h1 className="text-4xl font-bold mb-4">Incy</h1>
      <p className="text-muted-foreground text-lg mb-8">
        Reliable incident management
      </p>
      <div className="flex gap-4">
        <Link
          href="/incidents"
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          View Incidents
        </Link>
        <Link
          href="/services"
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-3 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
        >
          Manage Services
        </Link>
      </div>
    </div>
  );
}

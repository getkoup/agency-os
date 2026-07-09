import { ArrowRight, Layers3, ShieldCheck, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

const principles = [
  {
    title: "Component first",
    body: "Server-first UI with small reusable pieces and shadcn primitives.",
    icon: Layers3,
  },
  {
    title: "Strict by default",
    body: "TypeScript strict mode, validated input, and explicit data flow.",
    icon: ShieldCheck,
  },
  {
    title: "Boring wins",
    body: "Clear structure beats clever abstractions and hidden behavior.",
    icon: Sparkles,
  },
] as const

export default function Home() {
  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl flex-col justify-center gap-10">
        <div className="max-w-3xl space-y-6">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Agency OS
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
            Basic app foundation ready.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
            Next.js App Router, TypeScript, Tailwind, shadcn-style primitives,
            Bun, and Supabase-ready configuration are wired for clean future work.
          </p>
          <Button asChild size="lg">
            <a href="https://nextjs.org/docs" target="_blank" rel="noreferrer">
              Read Next.js docs
              <ArrowRight aria-hidden="true" />
            </a>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {principles.map((principle) => (
            <article
              className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm"
              key={principle.title}
            >
              <principle.icon className="mb-4 size-5 text-muted-foreground" aria-hidden="true" />
              <h2 className="font-medium">{principle.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{principle.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

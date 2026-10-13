import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarCheck,
  ClipboardCheck,
  FileSpreadsheet,
  Flag,
  LayoutList,
  NotebookPen,
  Ticket,
} from "lucide-react";
import { Logo } from "@/components/logo";
import {
  PlanCardMock,
  ReviewMock,
  TeamWeekMock,
} from "@/components/landing/mockups";
import { buttonVariants } from "@/components/ui/button";
import { SIGN_IN_URL, SIGN_UP_URL, SITE_URL } from "@/lib/links";
import { cn } from "@/lib/utils";

const TITLE = "Floppy · Less strain. More brain.";
const PITCH =
  "Floppy gets every engineer on your team to commit to one thing they'll ship this week, reviewed before you approve it, so by Friday you know what actually shipped.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: PITCH },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Floppy" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: PITCH },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:image", content: `${SITE_URL}/og.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Floppy: Less strain. More brain." },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: PITCH },
      { name: "twitter:image", content: `${SITE_URL}/og.png` },
    ],
  }),
  component: Landing,
});

const primaryCta = cn(
  buttonVariants({ size: "lg" }),
  "h-11 cursor-pointer bg-[#FF5722] px-5 text-white hover:bg-[#E64A19]"
);
const secondaryCta = cn(
  buttonVariants({ variant: "outline", size: "lg" }),
  "h-11 cursor-pointer px-5"
);

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <AiReview />
        <ForLeads />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="/" aria-label="Floppy home" className="cursor-pointer">
          <Logo className="h-7" />
        </a>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#how-it-works" className="hover:text-foreground">
            How it works
          </a>
          <a href="#ai-review" className="hover:text-foreground">
            The AI review
          </a>
          <a href="#for-leads" className="hover:text-foreground">
            For leads
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <a
            href={SIGN_IN_URL}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "cursor-pointer"
            )}
          >
            Sign in
          </a>
          <a
            href={SIGN_UP_URL}
            className={cn(
              buttonVariants(),
              "cursor-pointer bg-[#FF5722] text-white hover:bg-[#E64A19]"
            )}
          >
            Get started
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <p className="text-sm font-medium text-[#E64A19]">
          Weekly planning for software teams
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Less strain.
          <br />
          More brain.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">{PITCH}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={SIGN_UP_URL} className={primaryCta}>
            Get started
            <ArrowRight className="size-4" />
          </a>
          <a href="#ai-review" className={secondaryCta}>
            See an AI review
          </a>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Sign up with an email, start your organization, invite your team with
          a link.
        </p>
      </div>
      <div className="relative">
        <div
          className="absolute -inset-4 -z-10 rounded-3xl bg-[#FF5722]/10 blur-2xl"
          aria-hidden
        />
        <PlanCardMock />
      </div>
    </section>
  );
}

const ALTERNATIVES = [
  {
    icon: NotebookPen,
    name: "Notion",
    text: "A blank page for every plan. Five people write five formats, and on Monday nobody can tell what ships on Friday.",
  },
  {
    icon: Ticket,
    name: "Linear",
    text: "Great at tickets. But a cycle full of issues isn't a commitment, and nothing asks why this week's work matters.",
  },
  {
    icon: FileSpreadsheet,
    name: "Spreadsheets",
    text: 'A sheet holds whatever you type, including "work on checkout". It never pushes back.',
  },
];

function Problem() {
  return (
    <section className="border-y bg-muted/40">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight">
          Your team already plans somewhere. That&apos;s the problem.
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {ALTERNATIVES.map(({ icon: Icon, name, text }) => (
            <div key={name} className="rounded-xl border bg-background p-5">
              <Icon className="size-5 text-muted-foreground" />
              <p className="mt-3 font-semibold">{name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 max-w-2xl text-lg">
          Floppy is narrower on purpose: one plan per person per week, the same
          shape every time, checked before anyone approves it, and a yes or no
          on Friday.
        </p>
      </div>
    </section>
  );
}

const STEPS = [
  {
    icon: LayoutList,
    when: "Monday morning",
    title: "Write the plan",
    text: "One main task and why it matters, the sub-goals that get it over the line, and how users will hear about it. Or paste your messy notes and Floppy drafts it for you to edit.",
  },
  {
    icon: ClipboardCheck,
    when: "Before lunch",
    title: "Get it approved",
    text: "Floppy reviews the plan the way a demanding lead would, before you submit. Then your lead approves it, or sends it back with a comment saying what to change.",
  },
  {
    icon: Flag,
    when: "All week, then Friday",
    title: "Track it, then close it",
    text: "Tick tasks off as they're done. On Friday, close the week: did the main thing ship? Yes or no, on the record.",
  },
];

function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 md:py-24"
    >
      <h2 className="text-3xl font-bold tracking-tight">How a week works</h2>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Ship one significant thing by Friday, and don&apos;t carry half-done
        work into Monday.
      </p>
      <ol className="mt-10 grid gap-6 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, when, title, text }, i) => (
          <li key={title} className="rounded-xl border p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-full bg-[#FF5722] text-sm font-semibold text-white">
                {i + 1}
              </span>
              <span className="text-sm text-muted-foreground">{when}</span>
            </div>
            <p className="mt-4 flex items-center gap-2 text-lg font-semibold">
              <Icon className="size-5" />
              {title}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AiReview() {
  return (
    <section id="ai-review" className="scroll-mt-20 border-y bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            The approval meeting, before the meeting
          </h2>
          <p className="mt-4 text-muted-foreground">
            A good task is a result you can check on Friday. &ldquo;Checkout
            handles expired cards, confirmed on staging&rdquo; is one.
            &ldquo;Implement checkout&rdquo; isn&apos;t.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            {[
              "Flags tasks that describe work instead of a result you can check.",
              "Asks why the main task matters, when the plan doesn't say.",
              "Notices when nothing puts the work in front of users.",
              "Calls out scope that won't fit in a week, using your hour estimates.",
              "Every finding sits next to its task with a rewrite you apply in one click.",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <CalendarCheck className="mt-0.5 size-4 shrink-0 text-[#E64A19]" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-muted-foreground">
            When it doesn&apos;t know a detail, it leaves a [blank] for you
            instead of making one up. And if the AI is slow or down, you plan
            and submit as usual.
          </p>
        </div>
        <ReviewMock />
      </div>
    </section>
  );
}

function ForLeads() {
  return (
    <section
      id="for-leads"
      className="mx-auto grid max-w-6xl scroll-mt-20 items-center gap-10 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.2fr_1fr]"
    >
      <TeamWeekMock />
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          For leads: the whole week on one screen
        </h2>
        <ul className="mt-6 space-y-4">
          {[
            [
              "See who's on track",
              "Who has submitted, what's approved, how many tasks are done, and whether each main goal shipped.",
            ],
            [
              "Approve from one queue",
              "Approve, or send a plan back with a comment. Nobody approves their own plan.",
            ],
            [
              "Commitments, not half-thoughts",
              "Drafts stay private until they're submitted, so you review what people actually commit to.",
            ],
            [
              "Learn from past weeks",
              "Every closed week stays on the record, so you can see who ships what they plan.",
            ],
          ].map(([title, text]) => (
            <li key={title}>
              <p className="font-semibold">{title}</p>
              <p className="text-sm text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="bg-foreground text-background">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Plan this week by lunchtime.
          </h2>
          <p className="mt-2 text-background/70">
            Start an organization, add a team and a lead, and send your people
            an invite link.
          </p>
        </div>
        <a href={SIGN_UP_URL} className={primaryCta}>
          Get started
          <ArrowRight className="size-4" />
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <Logo className="h-6" />
          <span>Less strain. More brain.</span>
        </div>
        <div className="flex gap-4">
          <a href={SIGN_IN_URL} className="hover:text-foreground">
            Sign in
          </a>
          <a href={SIGN_UP_URL} className="hover:text-foreground">
            Get started
          </a>
          <span>© 2026 Floppy</span>
        </div>
      </div>
    </footer>
  );
}

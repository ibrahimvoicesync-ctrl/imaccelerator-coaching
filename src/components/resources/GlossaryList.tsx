"use client";

import { useState } from "react";
import { BookOpen, Pencil, Trash2, Search } from "lucide-react";

export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  created_by_user: { name: string } | null;
}

interface GlossaryListProps {
  terms: GlossaryTerm[];
  canManage: boolean;
  onEdit: (term: GlossaryTerm) => void;
  onDelete: (id: string) => void;
}

export function GlossaryList({ terms, canManage, onEdit, onDelete }: GlossaryListProps) {
  const [search, setSearch] = useState("");

  const filtered = terms.filter((t) =>
    t.term.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce<Record<string, GlossaryTerm[]>>((acc, term) => {
    const letter = term.term[0]?.toUpperCase() ?? "#";
    if (!acc[letter]) acc[letter] = [];
    acc[letter].push(term);
    return acc;
  }, {});

  const sortedLetters = Object.keys(grouped).sort();

  const showSearch = terms.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Editorial search bar — hidden until there's something to search */}
      {showSearch && (
        <div className="relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-ima-text-secondary pointer-events-none"
            strokeWidth={2.25}
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search terms…"
            aria-label="Search glossary terms"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-h-[52px] pl-11 pr-4 rounded-2xl bg-ima-surface border border-ima-border text-sm text-ima-text placeholder:text-ima-text-secondary focus:border-ima-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2 motion-safe:transition-colors"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-ima-border bg-ima-bg/60 p-8 md:p-10">
          <div className="flex flex-col items-center gap-4 text-center max-w-md mx-auto">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full bg-ima-surface-accent text-ima-primary"
              aria-hidden="true"
            >
              <BookOpen className="h-6 w-6" strokeWidth={2.25} />
            </span>
            <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-ima-text-secondary">
              {search ? "No match" : "Empty glossary"}
            </p>
            <h3 className="text-xl md:text-2xl font-semibold tracking-tight text-ima-text leading-tight">
              {search ? "Nothing matched" : "No glossary terms yet"}
            </h3>
            <p className="text-sm text-ima-text-secondary leading-relaxed">
              {search
                ? "Try a different term, or clear the search to browse everything."
                : "Add your first definition to start building shared vocabulary."}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          {sortedLetters.map((letter, idx) => (
            <section key={letter} className={idx === 0 ? "" : "mt-8"}>
              <div className="flex items-baseline gap-3 mb-3 pb-2 border-b border-ima-border">
                <h3 className="text-3xl md:text-4xl font-semibold tracking-tight text-ima-primary leading-none tabular-nums">
                  {letter}
                </h3>
                <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-ima-text-secondary tabular-nums">
                  {`${grouped[letter].length} term${grouped[letter].length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <dl className="flex flex-col gap-1">
                {grouped[letter].map((term) => (
                  <div
                    key={term.id}
                    className="group rounded-xl px-3 py-3 hover:bg-ima-surface-light motion-safe:transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-base font-semibold tracking-tight text-ima-text">
                        {term.term}
                      </dt>
                      {canManage && (
                        <div className="flex gap-1 flex-shrink-0 -mr-1 -mt-1">
                          <button
                            type="button"
                            onClick={() => onEdit(term)}
                            aria-label={"Edit " + term.term}
                            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-ima-text-secondary hover:text-ima-primary hover:bg-ima-surface-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2 motion-safe:transition-colors"
                          >
                            <Pencil className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(term.id)}
                            aria-label={"Delete " + term.term}
                            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-ima-text-secondary hover:text-ima-error hover:bg-ima-error/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-error focus-visible:ring-offset-2 motion-safe:transition-colors"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </div>
                    <dd className="text-sm text-ima-text-secondary leading-relaxed mt-1">
                      {term.definition}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

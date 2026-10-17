"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { PlaceSuggestion } from "@/types/hydro";
import { parseCoordinateQuery } from "@/lib/api/nominatim";
import { parseConversationalQuery } from "@/lib/experience/catalog";

interface SearchBarProps {
  onSelect: (place: PlaceSuggestion) => void;
  variant?: "hero" | "compact";
  initialLabel?: string;
}

export function SearchBar({ onSelect, variant = "hero", initialLabel = "" }: SearchBarProps) {
  const [query, setQuery] = useState(initialLabel);
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const edited = useRef(false);

  useEffect(() => {
    edited.current = false;
    setQuery(initialLabel);
    setOpen(false);
    setResults([]);
  }, [initialLabel]);

  useEffect(() => {
    if (!edited.current) return;
    const trimmed = parseConversationalQuery(query);
    if (trimmed.length < 2) {
      setResults([]);
      setStatus(null);
      return;
    }
    const coordinate = parseCoordinateQuery(trimmed);
    if (coordinate) {
      setResults([coordinate]);
      setOpen(true);
      setStatus(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then(async (response) => {
          const body: unknown = await response.json();
          if (!response.ok || !isSearchPayload(body)) {
            throw new Error(readError(body) ?? "Place search failed.");
          }
          setResults(body.places);
          setOpen(true);
          setActive(0);
          setStatus(body.places.length === 0 ? "No matches. You can also enter latitude, longitude." : null);
        })
        .catch((reason: unknown) => {
          if (reason instanceof DOMException && reason.name === "AbortError") return;
          setStatus(reason instanceof Error ? reason.message : "Place search failed.");
          setResults([]);
        });
    }, 280);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, []);

  const choose = (place: PlaceSuggestion) => {
    setQuery(place.label);
    setOpen(false);
    onSelect(place);
  };

  return (
    <div ref={boxRef} className={variant === "hero" ? "relative w-full max-w-xl" : "relative w-full"}>
      <label className="sr-only" htmlFor={`${listId}-input`}>
        Search a watershed
      </label>
      <div className="flex items-center gap-2 rounded-full border border-line bg-abyss/80 px-4 py-2 backdrop-blur">
        <Search size={16} className="text-aqua" />
        <input
          id={`${listId}-input`}
          value={query}
          placeholder="Search a city, a river near a place, or latitude, longitude"
          className="w-full bg-transparent text-sm text-foam outline-none placeholder:text-mist"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={(event) => {
            edited.current = true;
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(results.length > 0)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((current) => Math.min(results.length - 1, current + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((current) => Math.max(0, current - 1));
            } else if (event.key === "Enter" && results[active]) {
              event.preventDefault();
              const place = results[active];
              if (place) choose(place);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
      </div>
      {open && (results.length > 0 || status) ? (
        <ul id={listId} role="listbox" className="glass absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-2xl p-2">
          {results.map((place, index) => (
            <li key={place.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm ${index === active ? "bg-white/10 text-foam" : "text-mist"}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(place)}
              >
                {place.label}
              </button>
            </li>
          ))}
          {status ? <li className="px-3 py-2 text-xs text-mist">{status}</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

function isSearchPayload(value: unknown): value is { places: PlaceSuggestion[] } {
  return typeof value === "object" && value !== null && Array.isArray((value as { places?: unknown }).places);
}

function readError(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("error" in value)) return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number | null, digits = 0): string {
  if (value === null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function shortHash(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

export function trendPercent(first: number | null, last: number | null): number | null {
  if (first === null || last === null || first === 0) return null;
  return ((last - first) / Math.abs(first)) * 100;
}

export const EXAMPLE_PLACES = [
  { id: "iowa-city", label: "Iowa City, Iowa, United States", latitude: 41.6611, longitude: -91.5302, kind: "city" },
  { id: "new-orleans", label: "New Orleans, Louisiana, United States", latitude: 29.9511, longitude: -90.0715, kind: "city" },
  { id: "sacramento", label: "Sacramento, California, United States", latitude: 38.5816, longitude: -121.4944, kind: "city" },
  { id: "dhaka", label: "Dhaka, Bangladesh", latitude: 23.8103, longitude: 90.4125, kind: "city" },
  { id: "rotterdam", label: "Rotterdam, Netherlands", latitude: 51.9244, longitude: 4.4777, kind: "city" },
] as const;

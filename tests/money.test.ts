import { describe, expect, it } from "vitest";
import { formatPaise, percentageDiscountPaise } from "@/lib/money";

describe("money (OFR-02, OFR-03)", () => {
  it("formats paise as INR with Indian grouping", () => {
    expect(formatPaise(80000)).toBe("₹800");
    expect(formatPaise(123456700)).toBe("₹12,34,567");
    expect(formatPaise(80050, { showPaise: true })).toBe("₹800.50");
  });
  it("rounds percentage discounts to nearest paise, halves up", () => {
    expect(percentageDiscountPaise(100000, 1250)).toBe(12500); // 12.5% of ₹1000
    expect(percentageDiscountPaise(333, 5000)).toBe(167); // 166.5 -> 167
    expect(percentageDiscountPaise(333, 3333)).toBe(111); // 110.9889 -> 111
    expect(percentageDiscountPaise(1, 1)).toBe(0);
  });
});

import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "../api/queries";
import { handleSessionExpired } from "./sessionExpired";

describe("handleSessionExpired", () => {
  it("clears caches and goes to the signed-out screen with the return path", () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.me, { id: "u" });
    qc.setQueryData(queryKeys.notifications, [1]);
    const navigate = vi.fn();
    handleSessionExpired(qc, { pathname: "/en/referrals/r1", search: "?tab=a" }, navigate);
    expect(navigate).toHaveBeenCalledWith("/en/signed-out?reason=expired&next=%2Fen%2Freferrals%2Fr1%3Ftab%3Da");
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
  });

  it("does nothing when nobody was signed in", () => {
    const navigate = vi.fn();
    handleSessionExpired(new QueryClient(), { pathname: "/bn", search: "" }, navigate);
    expect(navigate).not.toHaveBeenCalled();
  });
});

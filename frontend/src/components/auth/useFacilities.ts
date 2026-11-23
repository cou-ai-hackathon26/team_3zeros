"use client";

import { useQuery } from "@tanstack/react-query";
import { useApi } from "../../api/queries/provider";
import { asList } from "../../api/queries/hooks";
import type { Page } from "../../api/queries/types";

export interface DirectoryFacility {
  id: string;
  name: string;
  name_bn?: string;
}

/** GET /directory/facilities (exists). Used by the access request form. */
export function useDirectoryFacilities() {
  const api = useApi();
  return useQuery({
    queryKey: ["directory", "facilities", "list"],
    queryFn: async () => asList((await api.get<Page<DirectoryFacility> | DirectoryFacility[]>("/directory/facilities")).data),
    staleTime: 10 * 60_000,
  });
}

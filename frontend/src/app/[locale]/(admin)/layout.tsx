"use client";

import React from "react";
import { SiteNav } from "../../../components/SiteNav/SiteNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-route-group="admin">
      <SiteNav area="admin" />
      {children}
    </div>
  );
}

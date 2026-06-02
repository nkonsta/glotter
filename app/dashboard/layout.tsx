import type { Metadata } from "next";
import { AppProviders } from "@/components/AppProviders";

export const metadata: Metadata = {
  title: "Glotter",
  robots: { index: false },
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppProviders>{children}</AppProviders>;
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "THE MAP",
  description: "Cruscotto di direzione",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}

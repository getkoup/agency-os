import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Agency OS",
  description: "A clean Next.js foundation for the Agency OS app.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

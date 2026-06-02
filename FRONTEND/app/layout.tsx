import React from 'react';

export const metadata = {
  title: "AI Financial Data Converter",
  description: "Convert invoices, balance sheets, and spreadsheets using open-source AI",
};

// Next.js 16 strict layout structure
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, backgroundColor: "#fafafa" }}>
        {children}
      </body>
    </html>
  );
}
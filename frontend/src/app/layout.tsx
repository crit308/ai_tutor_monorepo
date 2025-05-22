import { metadata } from './metadata';
import ClientLayout from './ClientLayout';
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";

export { metadata };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConvexAuthNextjsServerProvider>
      <ClientLayout>{children}</ClientLayout>
    </ConvexAuthNextjsServerProvider>
  );
}

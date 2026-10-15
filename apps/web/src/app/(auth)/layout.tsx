import React from 'react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}

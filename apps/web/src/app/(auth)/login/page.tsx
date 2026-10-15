import React, { Suspense } from 'react';
import { LoginView } from './LoginView';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Đang tải...</div>}>
      <LoginView />
    </Suspense>
  );
}

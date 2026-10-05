import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import StatusPage from './pages/StatusPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import HomePage from './pages/HomePage.jsx';
import CatalogPage from './pages/CatalogPage.jsx';
import ProductPage from './pages/ProductPage.jsx';
import CartPage from './pages/CartPage.jsx';
import CheckoutPage from './pages/CheckoutPage.jsx';
import OrderConfirmationPage from './pages/OrderConfirmationPage.jsx';
import DemoInboxPage from './pages/DemoInboxPage.jsx';
import {
  ForgotPasswordPage,
  ResetPasswordPage,
  SignInPage,
  SignUpPage,
} from './pages/AuthPages.jsx';
import { AccountOrderPage, AccountPage } from './pages/AccountPage.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import DemoControlPage from './pages/DemoControlPage.jsx';
import AgentConsolePage from './pages/AgentConsolePage.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* P1 — storefront */}
        <Route index element={<HomePage />} />
        <Route path="search" element={<CatalogPage mode="search" />} />
        <Route path="c/:category" element={<CatalogPage key="category" mode="category" />} />
        <Route path="p/:slug" element={<ProductPage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="checkout" element={<CheckoutPage />} />
        <Route path="order/:number" element={<OrderConfirmationPage />} />

        {/* P2 — account */}
        <Route path="signin" element={<SignInPage />} />
        <Route path="signup" element={<SignUpPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route
          path="account"
          element={
            <RequireAuth>
              <AccountPage />
            </RequireAuth>
          }
        />
        <Route
          path="account/orders/:number"
          element={
            <RequireAuth>
              <AccountOrderPage />
            </RequireAuth>
          }
        />
        <Route path="demo-inbox" element={<DemoInboxPage />} />

        <Route path="status" element={<StatusPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Full-screen tools, outside the storefront chrome. */}
      <Route path="demo-control" element={<DemoControlPage />} />
      <Route path="agent" element={<AgentConsolePage />} />
    </Routes>
  );
}

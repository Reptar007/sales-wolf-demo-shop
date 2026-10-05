import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from './AuthContext.jsx';

const CartContext = createContext(null);

/**
 * The server is the source of truth for the cart; every mutation returns the
 * whole cart, so totals shown anywhere on the page are the server's totals.
 */
export function CartProvider({ children }) {
  const { user, ready } = useAuth();
  const [cart, setCart] = useState(null);
  // Drives the "added to cart" toast and the badge pop in the header.
  const [lastAdded, setLastAdded] = useState(null);

  const refresh = useCallback(async () => {
    const data = await api('/cart');
    setCart(data.cart);
    return data.cart;
  }, []);

  // Signing in merges the guest cart server-side, so re-read on every auth change.
  useEffect(() => {
    if (ready) refresh().catch(() => setCart(null));
  }, [ready, user?.id, refresh]);

  const mutate = useCallback(async (path, options) => {
    const data = await api(path, options);
    setCart(data.cart);
    return data.cart;
  }, []);

  const value = useMemo(
    () => ({
      cart,
      itemCount: cart?.itemCount ?? 0,
      refresh,
      setCart,
      lastAdded,
      dismissLastAdded: () => setLastAdded(null),
      addItem: async (variantId, quantity = 1) => {
        const next = await mutate('/cart/items', {
          method: 'POST',
          body: { variantId, quantity },
        });
        const line = next.items.find((i) => i.variant.id === variantId);
        if (line) {
          setLastAdded({
            key: Date.now(),
            quantity,
            product: line.product,
            label: line.variant.label,
          });
        }
        return next;
      },
      updateItem: (itemId, quantity) =>
        mutate(`/cart/items/${itemId}`, { method: 'PATCH', body: { quantity } }),
      removeItem: (itemId) => mutate(`/cart/items/${itemId}`, { method: 'DELETE' }),
      applyPromo: (code) => mutate('/cart/promo', { method: 'POST', body: { code } }),
      removePromo: () => mutate('/cart/promo', { method: 'DELETE' }),
    }),
    [cart, lastAdded, refresh, mutate],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider');
  return context;
}

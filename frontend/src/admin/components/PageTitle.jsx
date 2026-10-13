import { createContext, useContext, useState } from 'react';

const TitleContext = createContext({ title: null, setTitle: () => {} });

/** Lets each page publish its title so the top bar breadcrumb can show it. */
export function PageTitleProvider({ children }) {
  const [title, setTitle] = useState(null);
  return <TitleContext.Provider value={{ title, setTitle }}>{children}</TitleContext.Provider>;
}

export const usePageTitle = () => useContext(TitleContext).setTitle;
export const useCurrentPageTitle = () => useContext(TitleContext).title;

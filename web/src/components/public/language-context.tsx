"use client";
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
export type PublicLanguage = "en" | "sr";
const Context=createContext<{language:PublicLanguage;setLanguage:(value:PublicLanguage)=>void}>({language:"en",setLanguage:()=>undefined});
export function LanguageProvider({children}:PropsWithChildren){const[language,setValue]=useState<PublicLanguage>("en");useEffect(()=>{const saved=localStorage.getItem("trailbook-language");setValue(saved==="en"||saved==="sr"?saved:navigator.language.toLowerCase().startsWith("sr")?"sr":"en")},[]);useEffect(()=>{document.documentElement.lang=language==="sr"?"sr-Latn":"en"},[language]);function setLanguage(value:PublicLanguage){localStorage.setItem("trailbook-language",value);setValue(value)}return <Context.Provider value={{language,setLanguage}}>{children}</Context.Provider>}
export function usePublicLanguage(){return useContext(Context)}

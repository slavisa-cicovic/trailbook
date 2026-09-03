"use client";
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
export type PublicLanguage = "en" | "sr" | "it" | "es" | "de" | "fr";
const LANGUAGES:PublicLanguage[]=["en","sr","it","es","de","fr"];
const Context=createContext<{language:PublicLanguage;setLanguage:(value:PublicLanguage)=>void}>({language:"en",setLanguage:()=>undefined});
export function LanguageProvider({children}:PropsWithChildren){const[language,setValue]=useState<PublicLanguage>("en");useEffect(()=>{const saved=localStorage.getItem("trailbook-language");const browser=navigator.language.toLowerCase().split("-")[0];setValue(LANGUAGES.includes(saved as PublicLanguage)?saved as PublicLanguage:LANGUAGES.includes(browser as PublicLanguage)?browser as PublicLanguage:"en")},[]);useEffect(()=>{document.documentElement.lang=language==="sr"?"sr-Latn":language},[language]);function setLanguage(value:PublicLanguage){localStorage.setItem("trailbook-language",value);setValue(value)}return <Context.Provider value={{language,setLanguage}}>{children}</Context.Provider>}
export function usePublicLanguage(){return useContext(Context)}

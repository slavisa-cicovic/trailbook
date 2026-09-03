"use client";

import type { PropsWithChildren } from "react";
import Link from "next/link";

import { LanguageProvider, usePublicLanguage } from "./language-context";
import styles from "./public-shell.module.css";

export function Brand() {
  return <Link className={styles.brand} href="/"><span className={styles.mark}>⌁</span><span>Trailbook</span></Link>;
}

export function PublicHeader() {
  const { language, setLanguage } = usePublicLanguage();
  const t=language==="sr"?{audience:"Za koga je",how:"Kako radi",support:"Podrška",login:"Prijava",start:"Počnite"}:{audience:"Who it’s for",how:"How it works",support:"Support",login:"Sign in",start:"Get started"};
  return <header className={styles.header}>
    <Brand />
    <nav aria-label="Main navigation">
      <Link href="/#use-cases">{t.audience}</Link>
      <Link href="/help">{t.how}</Link>
      <Link href="/support">{t.support}</Link>
    </nav>
    <div className={styles.actions}><div className={styles.language}><button className={language==="en"?styles.active:""} onClick={()=>setLanguage("en")}>EN</button><span>/</span><button className={language==="sr"?styles.active:""} onClick={()=>setLanguage("sr")}>SR</button></div><Link href="/login">{t.login}</Link><Link className={styles.cta} href="/register">{t.start} <span>→</span></Link></div>
  </header>;
}

export function PublicFooter() {
  const { language }=usePublicLanguage();
  const t=language==="sr"?{tag:"Beležite rute. Čuvajte priče.",explore:"Istražite",audience:"Za koga je",help:"Help centar",info:"Informacije",support:"Podrška",privacy:"Privatnost",terms:"Uslovi korišćenja"}:{tag:"Record routes. Keep stories.",explore:"Explore",audience:"Who it’s for",help:"Help center",info:"Information",support:"Support",privacy:"Privacy",terms:"Terms & conditions"};
  return <footer className={styles.footer}>
    <div><Brand /><p>{t.tag}</p></div>
    <div><strong>{t.explore}</strong><Link href="/#use-cases">{t.audience}</Link><Link href="/help">{t.help}</Link></div>
    <div><strong>{t.info}</strong><Link href="/support">{t.support}</Link><Link href="/privacy">{t.privacy}</Link><Link href="/terms">{t.terms}</Link></div>
    <small>© {new Date().getFullYear()} Trailbook</small>
  </footer>;
}

export function PublicShell({ children }: PropsWithChildren) {
  return <LanguageProvider><div className={styles.shell}><PublicHeader />{children}<PublicFooter /></div></LanguageProvider>;
}

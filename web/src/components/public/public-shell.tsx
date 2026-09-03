"use client";

import type { PropsWithChildren } from "react";
import Image from "next/image";
import Link from "next/link";

import { LanguageProvider, usePublicLanguage } from "./language-context";
import styles from "./public-shell.module.css";

export const APP_STORE_URL="https://apps.apple.com/rs/app/trailbook-trips-trails/id6789852326";
export const GOOGLE_PLAY_URL="https://play.google.com/store/apps/details?id=com.slavisacicovic.trailbook";

export function StoreLinks() {
  const { language }=usePublicLanguage();
  return <div className={styles.storeLinks}>
    <a href={APP_STORE_URL} target="_blank" rel="noreferrer" aria-label={language==="sr"?"Preuzmite Trailbook na App Store-u":"Download Trailbook on the App Store"}><span className={styles.apple}>●</span><span><small>{language==="sr"?"Preuzmite na":"Download on the"}</small><b>App Store</b></span></a>
    <a href={GOOGLE_PLAY_URL} target="_blank" rel="noreferrer" aria-label={language==="sr"?"Preuzmite Trailbook na Google Play-u":"Get Trailbook on Google Play"}><span className={styles.play}>▶</span><span><small>{language==="sr"?"Preuzmite na":"GET IT ON"}</small><b>Google Play</b></span></a>
  </div>;
}

export function Brand() {
  return <Link className={styles.brand} href="/"><Image className={styles.mark} src="/icon.png" alt="" width={48} height={48} priority /><span>Trailbook</span></Link>;
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
    <div className={styles.actions}><div className={styles.language}><button className={language==="en"?styles.active:""} onClick={()=>setLanguage("en")}>EN</button><span>/</span><button className={language==="sr"?styles.active:""} onClick={()=>setLanguage("sr")}>SR</button></div><Link href="/login">{t.login}</Link></div>
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

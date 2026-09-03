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
  const download={en:"Download on the",sr:"Preuzmite na",it:"Scarica su",es:"Descárgala en",de:"Laden im",fr:"Télécharger sur"}[language];
  return <div className={styles.storeLinks}>
    <a href={APP_STORE_URL} target="_blank" rel="noreferrer" aria-label={`${download} App Store`}><span className={styles.apple}>●</span><span><small>{download}</small><b>App Store</b></span></a>
    <a href={GOOGLE_PLAY_URL} target="_blank" rel="noreferrer" aria-label={`${download} Google Play`}><span className={styles.play}>▶</span><span><small>{download}</small><b>Google Play</b></span></a>
  </div>;
}

export function Brand() {
  return <Link className={styles.brand} href="/"><Image className={styles.mark} src="/favicon-256.png" alt="" width={48} height={48} priority unoptimized /><span>Trailbook</span></Link>;
}

export function PublicHeader() {
  const { language, setLanguage } = usePublicLanguage();
  const t={en:{audience:"Who it’s for",how:"How it works",support:"Support",login:"Sign in"},sr:{audience:"Za koga je",how:"Kako radi",support:"Podrška",login:"Prijava"},it:{audience:"Per chi è",how:"Come funziona",support:"Assistenza",login:"Accedi"},es:{audience:"Para quién es",how:"Cómo funciona",support:"Soporte",login:"Iniciar sesión"},de:{audience:"Für wen",how:"So funktioniert’s",support:"Support",login:"Anmelden"},fr:{audience:"Pour qui",how:"Comment ça marche",support:"Assistance",login:"Se connecter"}}[language];
  return <header className={styles.header}>
    <Brand />
    <nav aria-label="Main navigation">
      <Link href="/#use-cases">{t.audience}</Link>
      <Link href="/help">{t.how}</Link>
      <Link href="/support">{t.support}</Link>
    </nav>
    <div className={styles.actions}><label className={styles.language}><span className={styles.srOnly}>Language</span><select aria-label="Language" value={language} onChange={event=>setLanguage(event.target.value as typeof language)}><option value="en">EN · English</option><option value="sr">SR · Srpski</option><option value="it">IT · Italiano</option><option value="es">ES · Español</option><option value="de">DE · Deutsch</option><option value="fr">FR · Français</option></select></label><Link href="/login">{t.login}</Link></div>
  </header>;
}

export function PublicFooter() {
  const { language }=usePublicLanguage();
  const t={en:{tag:"Record routes. Keep stories.",explore:"Explore",audience:"Who it’s for",help:"Help center",info:"Information",support:"Support",privacy:"Privacy",terms:"Terms & conditions"},sr:{tag:"Beležite rute. Čuvajte priče.",explore:"Istražite",audience:"Za koga je",help:"Help centar",info:"Informacije",support:"Podrška",privacy:"Privatnost",terms:"Uslovi korišćenja"},it:{tag:"Registra i percorsi. Conserva le storie.",explore:"Esplora",audience:"Per chi è",help:"Centro assistenza",info:"Informazioni",support:"Assistenza",privacy:"Privacy",terms:"Termini e condizioni"},es:{tag:"Registra rutas. Guarda historias.",explore:"Explorar",audience:"Para quién es",help:"Centro de ayuda",info:"Información",support:"Soporte",privacy:"Privacidad",terms:"Términos y condiciones"},de:{tag:"Routen aufzeichnen. Geschichten bewahren.",explore:"Entdecken",audience:"Für wen",help:"Hilfe-Center",info:"Informationen",support:"Support",privacy:"Datenschutz",terms:"Nutzungsbedingungen"},fr:{tag:"Enregistrez vos parcours. Gardez vos histoires.",explore:"Explorer",audience:"Pour qui",help:"Centre d’aide",info:"Informations",support:"Assistance",privacy:"Confidentialité",terms:"Conditions d’utilisation"}}[language];
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

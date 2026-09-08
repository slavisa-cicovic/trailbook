const en = {
  "premium.yourSubscription": "Your subscription",
  "premium.plan": "Plan",
  "premium.status": "Status",
  "premium.manage": "Manage subscription",
  "premium.openingStore": "Opening {{store}}…",
  "premium.requestRefund": "Request refund",
  "premium.openingApple": "Opening Apple…",
  "premium.purchaseUpdate": "Purchase update",
  "premium.dismiss": "Dismiss",
  "premium.completing": "Completing {{store}} purchase",
  "premium.verifying":
    "Trailbook is verifying or finishing a {{store}} transaction and will retry automatically.",
  "premium.nativeIosTitle": "Native iOS build required",
  "premium.nativeIosBody":
    "Apple subscriptions are unavailable in Expo Go. Use the installed Trailbook iOS build.",
  "premium.nativeAndroidTitle": "Native Android build required",
  "premium.nativeAndroidBody":
    "Google Play subscriptions are unavailable in Expo Go. Install a Play-distributed Trailbook Android build.",
  "premium.connecting": "Connecting to {{store}}…",
  "premium.loadingOptions": "Loading {{store}} subscription options…",
  "premium.unavailable": "{{store}} subscriptions unavailable",
  "premium.catalogError":
    "{{store}} could not load the subscription catalog. Check the connection and try again.",
  "premium.catalogMissing":
    "{{store}} did not return the Trailbook monthly or yearly subscription. Check the store connection and try again.",
  "premium.retry": "Retry",
  "premium.processing": "Processing…",
  "premium.completionPending": "Completion pending…",
  "premium.choose": "Choose {{type}}",
  "premium.summary.none": "No active Premium subscription.",
  "premium.summary.canceledUntil":
    "Canceled. Premium remains active until {{date}}.",
  "premium.summary.canceledPeriod":
    "Canceled. Premium remains active until the end of the current period.",
  "premium.summary.active": "Trailbook Premium is active.",
  "premium.summary.grace":
    "Premium remains active during the billing grace period.",
  "premium.summary.retry":
    "Premium access is paused while the store retries the subscription payment. Update your payment method to restore access.",
  "premium.summary.revoked": "This subscription was revoked.",
  "premium.summary.expired": "This subscription has expired.",
  "premium.plan.monthly": "Premium Monthly",
  "premium.plan.yearly": "Premium Yearly",
  "premium.plan.none": "No active plan",
  "premium.status.notSubscribed": "Not subscribed",
  "premium.status.active": "Active",
  "premium.status.retry": "Billing retry",
  "premium.status.canceled": "Canceled",
  "premium.status.expired": "Expired",
  "premium.status.grace": "Billing grace period",
  "premium.status.lifetime": "Lifetime",
  "premium.status.revoked": "Revoked",
  "premium.period.accessEnds": "Access ends",
  "premium.period.ended": "Current period ended",
  "premium.period.ends": "Current period ends",
  "premium.renewalTrial":
    "After the free trial, the subscription renews automatically at {{price}} per {{period}} until canceled.",
  "premium.renewal":
    "Renews automatically at {{price}} per {{period}} until canceled.",
  "premium.notAvailable": "Not available",
  "premium.message.pending":
    "The purchase is pending. Premium will activate after payment completes.",
  "premium.message.active": "Trailbook Premium is active.",
  "premium.message.inactive":
    "The store verified the subscription, but Premium is not currently active.",
  "premium.message.refreshed": "Trailbook purchase status refreshed.",
  "premium.message.failed":
    "The purchase operation failed. Try again or contact support.",
  "premium.message.restoreNone":
    "No active Trailbook subscription was found for this account.",
  "premium.message.signIn": "Sign in to restore Trailbook Premium.",
  "premium.message.ownership":
    "This subscription is linked to another Trailbook account. Sign in with the original account or contact support.",
  "premium.message.unsupported":
    "This store product is not supported by Trailbook.",
} as const;

export type PurchaseTranslationKey = keyof typeof en;
type Copy = Record<PurchaseTranslationKey, string>;

const sr: Copy = {
  "premium.yourSubscription": "Vaša pretplata",
  "premium.plan": "Plan",
  "premium.status": "Status",
  "premium.manage": "Upravljaj pretplatom",
  "premium.openingStore": "Otvaranje {{store}}…",
  "premium.requestRefund": "Zatraži povraćaj",
  "premium.openingApple": "Otvaranje Apple-a…",
  "premium.purchaseUpdate": "Ažuriranje kupovine",
  "premium.dismiss": "Zatvori",
  "premium.completing": "Završavanje {{store}} kupovine",
  "premium.verifying":
    "Trailbook proverava ili završava {{store}} transakciju i automatski će pokušati ponovo.",
  "premium.nativeIosTitle": "Potrebna je izvorna iOS verzija",
  "premium.nativeIosBody":
    "Apple pretplate nisu dostupne u Expo Go. Koristite instaliranu Trailbook iOS aplikaciju.",
  "premium.nativeAndroidTitle": "Potrebna je izvorna Android verzija",
  "premium.nativeAndroidBody":
    "Google Play pretplate nisu dostupne u Expo Go. Instalirajte Trailbook Android aplikaciju preko Google Play-a.",
  "premium.connecting": "Povezivanje sa {{store}}…",
  "premium.loadingOptions": "Učitavanje {{store}} opcija pretplate…",
  "premium.unavailable": "{{store}} pretplate nisu dostupne",
  "premium.catalogError":
    "{{store}} nije uspeo da učita katalog pretplata. Proverite vezu i pokušajte ponovo.",
  "premium.catalogMissing":
    "{{store}} nije vratio mesečnu ili godišnju Trailbook pretplatu. Proverite vezu i pokušajte ponovo.",
  "premium.retry": "Pokušaj ponovo",
  "premium.processing": "Obrada…",
  "premium.completionPending": "Čeka se završetak…",
  "premium.choose": "Izaberi {{type}}",
  "premium.summary.none": "Nema aktivne Premium pretplate.",
  "premium.summary.canceledUntil":
    "Otkazano. Premium ostaje aktivan do {{date}}.",
  "premium.summary.canceledPeriod":
    "Otkazano. Premium ostaje aktivan do kraja tekućeg perioda.",
  "premium.summary.active": "Trailbook Premium je aktivan.",
  "premium.summary.grace":
    "Premium ostaje aktivan tokom dodatnog perioda za naplatu.",
  "premium.summary.retry":
    "Premium pristup je pauziran dok prodavnica ponovo pokušava naplatu. Ažurirajte način plaćanja.",
  "premium.summary.revoked": "Ova pretplata je opozvana.",
  "premium.summary.expired": "Ova pretplata je istekla.",
  "premium.plan.monthly": "Premium mesečno",
  "premium.plan.yearly": "Premium godišnje",
  "premium.plan.none": "Nema aktivnog plana",
  "premium.status.notSubscribed": "Niste pretplaćeni",
  "premium.status.active": "Aktivna",
  "premium.status.retry": "Ponovni pokušaj naplate",
  "premium.status.canceled": "Otkazana",
  "premium.status.expired": "Istekla",
  "premium.status.grace": "Dodatni period naplate",
  "premium.status.lifetime": "Doživotna",
  "premium.status.revoked": "Opozvana",
  "premium.period.accessEnds": "Pristup se završava",
  "premium.period.ended": "Tekući period se završio",
  "premium.period.ends": "Tekući period se završava",
  "premium.renewalTrial":
    "Nakon probnog perioda, pretplata se automatski obnavlja po ceni {{price}} za {{period}} do otkazivanja.",
  "premium.renewal":
    "Automatski se obnavlja po ceni {{price}} za {{period}} do otkazivanja.",
  "premium.notAvailable": "Nije dostupno",
  "premium.message.pending":
    "Kupovina je na čekanju. Premium će biti aktiviran nakon završetka plaćanja.",
  "premium.message.active": "Trailbook Premium je aktivan.",
  "premium.message.inactive":
    "Prodavnica je potvrdila pretplatu, ali Premium trenutno nije aktivan.",
  "premium.message.refreshed": "Status Trailbook kupovine je osvežen.",
  "premium.message.failed":
    "Operacija kupovine nije uspela. Pokušajte ponovo ili kontaktirajte podršku.",
  "premium.message.restoreNone":
    "Za ovaj nalog nije pronađena aktivna Trailbook pretplata.",
  "premium.message.signIn": "Prijavite se da vratite Trailbook Premium.",
  "premium.message.ownership":
    "Ova pretplata je povezana sa drugim Trailbook nalogom. Prijavite se originalnim nalogom ili kontaktirajte podršku.",
  "premium.message.unsupported":
    "Trailbook ne podržava ovaj proizvod prodavnice.",
};

const it: Copy = {
  "premium.yourSubscription": "Il tuo abbonamento",
  "premium.plan": "Piano",
  "premium.status": "Stato",
  "premium.manage": "Gestisci abbonamento",
  "premium.openingStore": "Apertura di {{store}}…",
  "premium.requestRefund": "Richiedi rimborso",
  "premium.openingApple": "Apertura di Apple…",
  "premium.purchaseUpdate": "Aggiornamento acquisto",
  "premium.dismiss": "Chiudi",
  "premium.completing": "Completamento acquisto {{store}}",
  "premium.verifying":
    "Trailbook sta verificando o completando una transazione {{store}} e riproverà automaticamente.",
  "premium.nativeIosTitle": "È richiesta una build iOS nativa",
  "premium.nativeIosBody":
    "Gli abbonamenti Apple non sono disponibili in Expo Go. Usa la build iOS Trailbook installata.",
  "premium.nativeAndroidTitle": "È richiesta una build Android nativa",
  "premium.nativeAndroidBody":
    "Gli abbonamenti Google Play non sono disponibili in Expo Go. Installa Trailbook tramite Google Play.",
  "premium.connecting": "Connessione a {{store}}…",
  "premium.loadingOptions": "Caricamento opzioni di abbonamento {{store}}…",
  "premium.unavailable": "Abbonamenti {{store}} non disponibili",
  "premium.catalogError":
    "{{store}} non ha potuto caricare il catalogo. Controlla la connessione e riprova.",
  "premium.catalogMissing":
    "{{store}} non ha restituito l’abbonamento Trailbook mensile o annuale. Controlla la connessione e riprova.",
  "premium.retry": "Riprova",
  "premium.processing": "Elaborazione…",
  "premium.completionPending": "Completamento in sospeso…",
  "premium.choose": "Scegli {{type}}",
  "premium.summary.none": "Nessun abbonamento Premium attivo.",
  "premium.summary.canceledUntil":
    "Annullato. Premium resta attivo fino al {{date}}.",
  "premium.summary.canceledPeriod":
    "Annullato. Premium resta attivo fino alla fine del periodo corrente.",
  "premium.summary.active": "Trailbook Premium è attivo.",
  "premium.summary.grace":
    "Premium resta attivo durante il periodo di tolleranza.",
  "premium.summary.retry":
    "L’accesso Premium è sospeso mentre lo store riprova il pagamento. Aggiorna il metodo di pagamento.",
  "premium.summary.revoked": "Questo abbonamento è stato revocato.",
  "premium.summary.expired": "Questo abbonamento è scaduto.",
  "premium.plan.monthly": "Premium mensile",
  "premium.plan.yearly": "Premium annuale",
  "premium.plan.none": "Nessun piano attivo",
  "premium.status.notSubscribed": "Non abbonato",
  "premium.status.active": "Attivo",
  "premium.status.retry": "Nuovo tentativo di addebito",
  "premium.status.canceled": "Annullato",
  "premium.status.expired": "Scaduto",
  "premium.status.grace": "Periodo di tolleranza",
  "premium.status.lifetime": "A vita",
  "premium.status.revoked": "Revocato",
  "premium.period.accessEnds": "Fine accesso",
  "premium.period.ended": "Periodo corrente terminato",
  "premium.period.ends": "Fine periodo corrente",
  "premium.renewalTrial":
    "Dopo la prova gratuita, l’abbonamento si rinnova automaticamente a {{price}} per {{period}} fino all’annullamento.",
  "premium.renewal":
    "Si rinnova automaticamente a {{price}} per {{period}} fino all’annullamento.",
  "premium.notAvailable": "Non disponibile",
  "premium.message.pending":
    "L’acquisto è in sospeso. Premium verrà attivato al completamento del pagamento.",
  "premium.message.active": "Trailbook Premium è attivo.",
  "premium.message.inactive":
    "Lo store ha verificato l’abbonamento, ma Premium non è attualmente attivo.",
  "premium.message.refreshed":
    "Lo stato dell’acquisto Trailbook è stato aggiornato.",
  "premium.message.failed":
    "Operazione di acquisto non riuscita. Riprova o contatta l’assistenza.",
  "premium.message.restoreNone":
    "Nessun abbonamento Trailbook attivo trovato per questo account.",
  "premium.message.signIn": "Accedi per ripristinare Trailbook Premium.",
  "premium.message.ownership":
    "Questo abbonamento è collegato a un altro account Trailbook. Accedi con l’account originale o contatta l’assistenza.",
  "premium.message.unsupported":
    "Questo prodotto dello store non è supportato da Trailbook.",
};

const es: Copy = {
  ...en,
  "premium.openingStore": "Abriendo {{store}}…",
  "premium.openingApple": "Abriendo Apple…",
  "premium.completing": "Finalizando la compra de {{store}}",
  "premium.verifying":
    "Trailbook está verificando o finalizando una transacción de {{store}} y volverá a intentarlo automáticamente.",
  "premium.nativeIosTitle": "Se requiere una compilación nativa de iOS",
  "premium.nativeIosBody":
    "Las suscripciones de Apple no están disponibles en Expo Go. Usa la aplicación Trailbook instalada para iOS.",
  "premium.nativeAndroidTitle": "Se requiere una compilación nativa de Android",
  "premium.nativeAndroidBody":
    "Las suscripciones de Google Play no están disponibles en Expo Go. Instala Trailbook desde Google Play.",
  "premium.connecting": "Conectando con {{store}}…",
  "premium.loadingOptions": "Cargando opciones de suscripción de {{store}}…",
  "premium.unavailable": "Suscripciones de {{store}} no disponibles",
  "premium.catalogError":
    "{{store}} no pudo cargar el catálogo de suscripciones. Comprueba la conexión e inténtalo de nuevo.",
  "premium.catalogMissing":
    "{{store}} no devolvió la suscripción mensual o anual de Trailbook. Comprueba la conexión e inténtalo de nuevo.",
  "premium.choose": "Elegir {{type}}",
  "premium.yourSubscription": "Tu suscripción",
  "premium.plan": "Plan",
  "premium.status": "Estado",
  "premium.manage": "Gestionar suscripción",
  "premium.requestRefund": "Solicitar reembolso",
  "premium.purchaseUpdate": "Actualización de compra",
  "premium.dismiss": "Cerrar",
  "premium.retry": "Reintentar",
  "premium.processing": "Procesando…",
  "premium.completionPending": "Finalización pendiente…",
  "premium.summary.none": "No hay una suscripción Premium activa.",
  "premium.summary.active": "Trailbook Premium está activo.",
  "premium.summary.canceledUntil":
    "Cancelada. Premium permanece activo hasta {{date}}.",
  "premium.summary.canceledPeriod":
    "Cancelada. Premium permanece activo hasta el final del periodo actual.",
  "premium.summary.grace":
    "Premium permanece activo durante el periodo de gracia de facturación.",
  "premium.summary.retry":
    "El acceso Premium está pausado mientras la tienda reintenta el pago. Actualiza tu método de pago.",
  "premium.summary.revoked": "Esta suscripción fue revocada.",
  "premium.summary.expired": "Esta suscripción ha caducado.",
  "premium.plan.monthly": "Premium mensual",
  "premium.plan.yearly": "Premium anual",
  "premium.plan.none": "No hay plan activo",
  "premium.status.notSubscribed": "Sin suscripción",
  "premium.status.active": "Activa",
  "premium.status.retry": "Reintento de facturación",
  "premium.status.canceled": "Cancelada",
  "premium.status.expired": "Caducada",
  "premium.status.lifetime": "De por vida",
  "premium.status.grace": "Periodo de gracia de facturación",
  "premium.status.revoked": "Revocada",
  "premium.period.accessEnds": "El acceso termina",
  "premium.period.ended": "El periodo actual terminó",
  "premium.period.ends": "El periodo actual termina",
  "premium.renewalTrial":
    "Tras la prueba gratuita, la suscripción se renueva automáticamente por {{price}} cada {{period}} hasta que se cancele.",
  "premium.renewal":
    "Se renueva automáticamente por {{price}} cada {{period}} hasta que se cancele.",
  "premium.notAvailable": "No disponible",
  "premium.message.pending":
    "La compra está pendiente. Premium se activará cuando finalice el pago.",
  "premium.message.active": "Trailbook Premium está activo.",
  "premium.message.inactive":
    "La tienda verificó la suscripción, pero Premium no está activo actualmente.",
  "premium.message.refreshed": "Se actualizó el estado de compra de Trailbook.",
  "premium.message.failed":
    "La operación de compra falló. Inténtalo de nuevo o contacta con soporte.",
  "premium.message.restoreNone":
    "No se encontró una suscripción activa de Trailbook para esta cuenta.",
  "premium.message.signIn": "Inicia sesión para restaurar Trailbook Premium.",
  "premium.message.ownership":
    "Esta suscripción está vinculada a otra cuenta de Trailbook. Inicia sesión con la cuenta original o contacta con soporte.",
  "premium.message.unsupported":
    "Trailbook no admite este producto de la tienda.",
};
const de: Copy = {
  ...en,
  "premium.openingStore": "{{store}} wird geöffnet…",
  "premium.openingApple": "Apple wird geöffnet…",
  "premium.completing": "{{store}}-Kauf wird abgeschlossen",
  "premium.verifying":
    "Trailbook prüft oder beendet eine {{store}}-Transaktion und versucht es automatisch erneut.",
  "premium.nativeIosTitle": "Native iOS-Version erforderlich",
  "premium.nativeIosBody":
    "Apple-Abos sind in Expo Go nicht verfügbar. Verwende die installierte Trailbook-iOS-App.",
  "premium.nativeAndroidTitle": "Native Android-Version erforderlich",
  "premium.nativeAndroidBody":
    "Google-Play-Abos sind in Expo Go nicht verfügbar. Installiere Trailbook über Google Play.",
  "premium.connecting": "Verbindung mit {{store}}…",
  "premium.loadingOptions": "Abo-Optionen von {{store}} werden geladen…",
  "premium.unavailable": "{{store}}-Abos nicht verfügbar",
  "premium.catalogError":
    "{{store}} konnte den Abo-Katalog nicht laden. Prüfe die Verbindung und versuche es erneut.",
  "premium.catalogMissing":
    "{{store}} hat kein monatliches oder jährliches Trailbook-Abo geliefert. Prüfe die Verbindung und versuche es erneut.",
  "premium.choose": "{{type}} wählen",
  "premium.yourSubscription": "Dein Abonnement",
  "premium.plan": "Tarif",
  "premium.status": "Status",
  "premium.manage": "Abonnement verwalten",
  "premium.requestRefund": "Erstattung anfordern",
  "premium.purchaseUpdate": "Kaufaktualisierung",
  "premium.dismiss": "Schließen",
  "premium.retry": "Erneut versuchen",
  "premium.processing": "Verarbeitung…",
  "premium.completionPending": "Abschluss ausstehend…",
  "premium.summary.none": "Kein aktives Premium-Abonnement.",
  "premium.summary.active": "Trailbook Premium ist aktiv.",
  "premium.summary.canceledUntil":
    "Gekündigt. Premium bleibt bis {{date}} aktiv.",
  "premium.summary.canceledPeriod":
    "Gekündigt. Premium bleibt bis zum Ende des aktuellen Zeitraums aktiv.",
  "premium.summary.grace": "Premium bleibt während der Zahlungsfrist aktiv.",
  "premium.summary.retry":
    "Der Premium-Zugriff ist pausiert, während der Store die Zahlung erneut versucht. Aktualisiere deine Zahlungsmethode.",
  "premium.summary.revoked": "Dieses Abonnement wurde widerrufen.",
  "premium.summary.expired": "Dieses Abonnement ist abgelaufen.",
  "premium.plan.monthly": "Premium monatlich",
  "premium.plan.yearly": "Premium jährlich",
  "premium.plan.none": "Kein aktiver Tarif",
  "premium.status.notSubscribed": "Nicht abonniert",
  "premium.status.active": "Aktiv",
  "premium.status.retry": "Erneuter Zahlungsversuch",
  "premium.status.canceled": "Gekündigt",
  "premium.status.expired": "Abgelaufen",
  "premium.status.lifetime": "Lebenslang",
  "premium.status.grace": "Zahlungsfrist",
  "premium.status.revoked": "Widerrufen",
  "premium.period.accessEnds": "Zugriff endet",
  "premium.period.ended": "Aktueller Zeitraum beendet",
  "premium.period.ends": "Aktueller Zeitraum endet",
  "premium.renewalTrial":
    "Nach dem kostenlosen Test verlängert sich das Abo automatisch für {{price}} pro {{period}}, bis es gekündigt wird.",
  "premium.renewal":
    "Verlängert sich automatisch für {{price}} pro {{period}}, bis es gekündigt wird.",
  "premium.notAvailable": "Nicht verfügbar",
  "premium.message.pending":
    "Der Kauf ist ausstehend. Premium wird nach Abschluss der Zahlung aktiviert.",
  "premium.message.active": "Trailbook Premium ist aktiv.",
  "premium.message.inactive":
    "Der Store hat das Abo bestätigt, aber Premium ist derzeit nicht aktiv.",
  "premium.message.refreshed": "Der Trailbook-Kaufstatus wurde aktualisiert.",
  "premium.message.failed":
    "Der Kaufvorgang ist fehlgeschlagen. Versuche es erneut oder kontaktiere den Support.",
  "premium.message.restoreNone":
    "Für dieses Konto wurde kein aktives Trailbook-Abo gefunden.",
  "premium.message.signIn":
    "Melde dich an, um Trailbook Premium wiederherzustellen.",
  "premium.message.ownership":
    "Dieses Abo ist mit einem anderen Trailbook-Konto verknüpft. Melde dich mit dem ursprünglichen Konto an oder kontaktiere den Support.",
  "premium.message.unsupported":
    "Dieses Store-Produkt wird von Trailbook nicht unterstützt.",
};
const fr: Copy = {
  ...en,
  "premium.openingStore": "Ouverture de {{store}}…",
  "premium.openingApple": "Ouverture d’Apple…",
  "premium.completing": "Finalisation de l’achat {{store}}",
  "premium.verifying":
    "Trailbook vérifie ou finalise une transaction {{store}} et réessaiera automatiquement.",
  "premium.nativeIosTitle": "Build iOS natif requis",
  "premium.nativeIosBody":
    "Les abonnements Apple ne sont pas disponibles dans Expo Go. Utilisez l’application Trailbook iOS installée.",
  "premium.nativeAndroidTitle": "Build Android natif requis",
  "premium.nativeAndroidBody":
    "Les abonnements Google Play ne sont pas disponibles dans Expo Go. Installez Trailbook via Google Play.",
  "premium.connecting": "Connexion à {{store}}…",
  "premium.loadingOptions": "Chargement des abonnements {{store}}…",
  "premium.unavailable": "Abonnements {{store}} indisponibles",
  "premium.catalogError":
    "{{store}} n’a pas pu charger le catalogue d’abonnements. Vérifiez la connexion et réessayez.",
  "premium.catalogMissing":
    "{{store}} n’a renvoyé aucun abonnement Trailbook mensuel ou annuel. Vérifiez la connexion et réessayez.",
  "premium.choose": "Choisir {{type}}",
  "premium.yourSubscription": "Votre abonnement",
  "premium.plan": "Formule",
  "premium.status": "Statut",
  "premium.manage": "Gérer l’abonnement",
  "premium.requestRefund": "Demander un remboursement",
  "premium.purchaseUpdate": "Mise à jour de l’achat",
  "premium.dismiss": "Fermer",
  "premium.retry": "Réessayer",
  "premium.processing": "Traitement…",
  "premium.completionPending": "Finalisation en attente…",
  "premium.summary.none": "Aucun abonnement Premium actif.",
  "premium.summary.active": "Trailbook Premium est actif.",
  "premium.summary.canceledUntil":
    "Annulé. Premium reste actif jusqu’au {{date}}.",
  "premium.summary.canceledPeriod":
    "Annulé. Premium reste actif jusqu’à la fin de la période en cours.",
  "premium.summary.grace":
    "Premium reste actif pendant le délai de grâce de facturation.",
  "premium.summary.retry":
    "L’accès Premium est suspendu pendant que la boutique retente le paiement. Mettez à jour votre moyen de paiement.",
  "premium.summary.revoked": "Cet abonnement a été révoqué.",
  "premium.summary.expired": "Cet abonnement a expiré.",
  "premium.plan.monthly": "Premium mensuel",
  "premium.plan.yearly": "Premium annuel",
  "premium.plan.none": "Aucune formule active",
  "premium.status.notSubscribed": "Non abonné",
  "premium.status.active": "Actif",
  "premium.status.retry": "Nouvelle tentative de paiement",
  "premium.status.canceled": "Annulé",
  "premium.status.expired": "Expiré",
  "premium.status.lifetime": "À vie",
  "premium.status.grace": "Délai de grâce de facturation",
  "premium.status.revoked": "Révoqué",
  "premium.period.accessEnds": "Fin de l’accès",
  "premium.period.ended": "Période actuelle terminée",
  "premium.period.ends": "Fin de la période actuelle",
  "premium.renewalTrial":
    "Après l’essai gratuit, l’abonnement se renouvelle automatiquement à {{price}} par {{period}} jusqu’à son annulation.",
  "premium.renewal":
    "Se renouvelle automatiquement à {{price}} par {{period}} jusqu’à son annulation.",
  "premium.notAvailable": "Non disponible",
  "premium.message.pending":
    "L’achat est en attente. Premium sera activé une fois le paiement terminé.",
  "premium.message.active": "Trailbook Premium est actif.",
  "premium.message.inactive":
    "La boutique a vérifié l’abonnement, mais Premium n’est pas actif actuellement.",
  "premium.message.refreshed": "Le statut d’achat Trailbook a été actualisé.",
  "premium.message.failed":
    "L’opération d’achat a échoué. Réessayez ou contactez l’assistance.",
  "premium.message.restoreNone":
    "Aucun abonnement Trailbook actif n’a été trouvé pour ce compte.",
  "premium.message.signIn": "Connectez-vous pour restaurer Trailbook Premium.",
  "premium.message.ownership":
    "Cet abonnement est lié à un autre compte Trailbook. Connectez-vous avec le compte d’origine ou contactez l’assistance.",
  "premium.message.unsupported":
    "Ce produit de la boutique n’est pas pris en charge par Trailbook.",
};

export const purchaseTranslations = { en, sr, it, es, de, fr };

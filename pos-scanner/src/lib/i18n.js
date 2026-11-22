/**
 * Slice-1 copy: EN source of truth; RO / RU translations.
 * @typedef {"en" | "ro" | "ru"} LanguageCode
 */

/** @type {Record<LanguageCode, Record<string, string>>} */
export const MESSAGES = {
	en: {
		appName: "POSNext Scanner",
		settings: "Settings",
		save: "Save",
		close: "Close",
		retry: "Retry",
		startWork: "Start work",
		serverUrl: "ERPNext root URL",
		serverUrlHint: "HTTPS origin of your ERPNext / POSNext site (API only).",
		serverUrlPlaceholder: "https://erp.hotel-life.md",
		language: "Language",
		langEn: "English",
		langRo: "Romanian",
		langRu: "Russian",
		theme: "Theme",
		themeSystem: "System",
		themeDark: "Dark",
		themeLight: "Light",
		settingsSaved: "Settings saved",
		checkingConnection: "Checking connection…",
		connected: "Connected",
		connectedHint: "Server is reachable. Pairing with a POS shift comes next.",
		connectionError: "Connection error",
		invalidUrl: "Enter a valid HTTPS URL (https://…)",
		bundledUrlError: "Enter the ERPNext / POSNext API URL, not the in-app UI address.",
		httpProdError: "Production needs HTTPS. HTTP is only for localhost / LAN.",
		bridgeError: "App bridge did not respond. Close settings and reinstall the APK if needed.",
		pairingStubTitle: "Pairing comes next",
		pairingStubBody:
			"Work mode will open after you pair with an active POS shift. That step is not in this build yet.",
		backToConnected: "Back",
		openSettings: "Settings",
		probeOkTitle: "Server reachable",
		probeOkDesc: "ERPNext / POSNext API responds (frappe.ping).",
		probeOfflineTitle: "No network",
		probeOfflineDesc: "This device is offline.",
		probeTimeoutTitle: "Server not responding",
		probeTimeoutDesc: "The server took too long to answer.",
		probeTlsTitle: "HTTPS / certificate error",
		probeTlsDesc: "Could not establish a secure connection to the server.",
		probeDnsTitle: "Server not found",
		probeDnsDesc: "Could not resolve the host name (DNS).",
		probeNotFoundTitle: "API not found",
		probeNotFoundDesc:
			"The site responds, but /api/method/frappe.ping is missing. Confirm this is an ERPNext / Frappe site.",
		probeServerErrorTitle: "Server error",
		probeServerErrorDesc: "The server returned an error.",
		probeInvalidUrlTitle: "Invalid URL",
		probeInvalidUrlDesc: "Use a site address like https://erp.example.com.",
		probeUnknownTitle: "Could not connect",
		probeUnknownDesc: "The API check failed.",
		probeStepCheckUrl: "Check the server URL in Settings",
		probeStepHttps: "Confirm the site opens over HTTPS",
		probeStepNetwork: "Check Wi‑Fi / mobile data",
		probeStepBrowser: "Open the site in a normal browser",
		probeStepVpn: "Check VPN / firewall",
		probeStepCert: "Confirm the site certificate is valid",
		probeStepDomain: "Check the domain spelling",
		probeStepLater: "Try again later",
		probeStepAdmin: "Contact the site administrator",
		probeStepPing: "In a browser open: /api/method/frappe.ping → message pong",
		probeStepRetry: "Then tap Retry in the app",
		requiredUrl: "Server URL is required",
	},
	ro: {
		appName: "POSNext Scanner",
		settings: "Setări",
		save: "Salvează",
		close: "Închide",
		retry: "Reîncearcă",
		startWork: "Începe lucrul",
		serverUrl: "URL rădăcină ERPNext",
		serverUrlHint: "Originea HTTPS a site-ului ERPNext / POSNext (doar API).",
		serverUrlPlaceholder: "https://erp.hotel-life.md",
		language: "Limbă",
		langEn: "English",
		langRo: "Română",
		langRu: "Rusă",
		theme: "Temă",
		themeSystem: "Sistem",
		themeDark: "Întunecată",
		themeLight: "Luminoasă",
		settingsSaved: "Setări salvate",
		checkingConnection: "Se verifică conexiunea…",
		connected: "Conectat",
		connectedHint: "Serverul este accesibil. Urmează împerecherea cu un schimb POS.",
		connectionError: "Eroare de conexiune",
		invalidUrl: "Introduceți un URL HTTPS valid (https://…)",
		bundledUrlError: "Introduceți URL-ul API ERPNext / POSNext, nu adresa UI din aplicație.",
		httpProdError: "Producția necesită HTTPS. HTTP doar pentru localhost / LAN.",
		bridgeError: "Puntea aplicației nu a răspuns. Închideți setările și reinstalați APK-ul dacă e nevoie.",
		pairingStubTitle: "Urmează împerecherea",
		pairingStubBody:
			"Modul de lucru se deschide după împerecherea cu un schimb POS activ. Acest pas nu este încă în această versiune.",
		backToConnected: "Înapoi",
		openSettings: "Setări",
		probeOkTitle: "Server accesibil",
		probeOkDesc: "API-ul ERPNext / POSNext răspunde (frappe.ping).",
		probeOfflineTitle: "Fără rețea",
		probeOfflineDesc: "Dispozitivul este offline.",
		probeTimeoutTitle: "Serverul nu răspunde",
		probeTimeoutDesc: "Timpul de așteptare a fost depășit.",
		probeTlsTitle: "Eroare HTTPS / certificat",
		probeTlsDesc: "Nu s-a putut stabili o conexiune securizată.",
		probeDnsTitle: "Server negăsit",
		probeDnsDesc: "Nu s-a putut rezolva numele de host (DNS).",
		probeNotFoundTitle: "API negăsit",
		probeNotFoundDesc:
			"Site-ul răspunde, dar /api/method/frappe.ping lipsește. Confirmați că este un site ERPNext / Frappe.",
		probeServerErrorTitle: "Eroare de server",
		probeServerErrorDesc: "Serverul a returnat o eroare.",
		probeInvalidUrlTitle: "URL invalid",
		probeInvalidUrlDesc: "Folosiți o adresă de tip https://erp.example.com.",
		probeUnknownTitle: "Conectare eșuată",
		probeUnknownDesc: "Verificarea API a eșuat.",
		probeStepCheckUrl: "Verificați URL-ul serverului în Setări",
		probeStepHttps: "Confirmați că site-ul se deschide pe HTTPS",
		probeStepNetwork: "Verificați Wi‑Fi / date mobile",
		probeStepBrowser: "Deschideți site-ul într-un browser normal",
		probeStepVpn: "Verificați VPN / firewall",
		probeStepCert: "Confirmați că certificatul este valid",
		probeStepDomain: "Verificați scrierea domeniului",
		probeStepLater: "Încercați mai târziu",
		probeStepAdmin: "Contactați administratorul site-ului",
		probeStepPing: "În browser: /api/method/frappe.ping → message pong",
		probeStepRetry: "Apoi apăsați Reîncearcă în aplicație",
		requiredUrl: "URL-ul serverului este obligatoriu",
	},
	ru: {
		appName: "POSNext Scanner",
		settings: "Настройки",
		save: "Сохранить",
		close: "Закрыть",
		retry: "Повторить",
		startWork: "Начать работу",
		serverUrl: "Корневой URL ERPNext",
		serverUrlHint: "HTTPS-origin сайта ERPNext / POSNext (только API).",
		serverUrlPlaceholder: "https://erp.hotel-life.md",
		language: "Язык",
		langEn: "English",
		langRo: "Română",
		langRu: "Русский",
		theme: "Тема",
		themeSystem: "Системная",
		themeDark: "Тёмная",
		themeLight: "Светлая",
		settingsSaved: "Настройки сохранены",
		checkingConnection: "Проверка соединения…",
		connected: "Подключено",
		connectedHint: "Сервер доступен. Далее — pairing со сменой POS.",
		connectionError: "Ошибка соединения",
		invalidUrl: "Укажите корректный HTTPS URL (https://…)",
		bundledUrlError: "Укажите URL ERPNext/POSNext (API), не адрес встроенного UI.",
		httpProdError: "Для продакшена нужен HTTPS. HTTP допустим только для localhost/LAN.",
		bridgeError: "Мост приложения не ответил. Закройте настройки и переустановите APK при необходимости.",
		pairingStubTitle: "Далее — pairing",
		pairingStubBody:
			"Рабочий режим откроется после pairing с активной сменой POS. Этот шаг пока не в этой сборке.",
		backToConnected: "Назад",
		openSettings: "Настройки",
		probeOkTitle: "Сервер доступен",
		probeOkDesc: "API ERPNext/POSNext отвечает (frappe.ping).",
		probeOfflineTitle: "Нет сети",
		probeOfflineDesc: "Устройство сейчас без доступа в интернет.",
		probeTimeoutTitle: "Сервер не отвечает",
		probeTimeoutDesc: "Превышено время ожидания ответа от сервера.",
		probeTlsTitle: "Ошибка HTTPS / сертификата",
		probeTlsDesc: "Не удалось установить защищённое соединение с сервером.",
		probeDnsTitle: "Сервер не найден",
		probeDnsDesc: "Не удалось разрешить имя хоста (DNS).",
		probeNotFoundTitle: "API не найден",
		probeNotFoundDesc:
			"Сервер отвечает, но /api/method/frappe.ping недоступен. Проверьте, что это сайт ERPNext/Frappe.",
		probeServerErrorTitle: "Ошибка сервера",
		probeServerErrorDesc: "Сервер вернул ошибку.",
		probeInvalidUrlTitle: "Некорректный URL",
		probeInvalidUrlDesc: "Укажите адрес сайта вида https://erp.example.com.",
		probeUnknownTitle: "Не удалось подключиться",
		probeUnknownDesc: "Проверка API сервера завершилась с ошибкой.",
		probeStepCheckUrl: "Проверьте URL сервера в настройках",
		probeStepHttps: "Убедитесь, что сайт открывается по HTTPS",
		probeStepNetwork: "Проверьте сеть (Wi‑Fi / мобильный интернет)",
		probeStepBrowser: "Проверьте, что сайт доступен в обычном браузере",
		probeStepVpn: "Проверьте VPN / файрвол",
		probeStepCert: "Убедитесь, что сертификат сайта действителен",
		probeStepDomain: "Проверьте написание домена",
		probeStepLater: "Попробуйте позже",
		probeStepAdmin: "Обратитесь к администратору сайта",
		probeStepPing: "В браузере: /api/method/frappe.ping → message pong",
		probeStepRetry: "Затем нажмите «Повторить» в приложении",
		requiredUrl: "Укажите URL сервера",
	},
};

/** @type {LanguageCode} */
let currentLang = "en";

/** @param {unknown} lang @returns {LanguageCode} */
export function normalizeI18nLanguage(lang) {
	const v = String(lang || "en").toLowerCase();
	if (v === "ro" || v === "ru") return v;
	return "en";
}

/** @param {LanguageCode} lang */
export function setLanguage(lang) {
	currentLang = normalizeI18nLanguage(lang);
	if (typeof document !== "undefined") {
		document.documentElement.lang = currentLang;
	}
}

/** @returns {LanguageCode} */
export function getLanguage() {
	return currentLang;
}

/**
 * @param {string} key
 * @param {Partial<Record<string, string | number>>} [vars]
 */
export function t(key, vars) {
	const table = MESSAGES[currentLang] || MESSAGES.en;
	let text = table[key] || MESSAGES.en[key] || key;
	if (vars) {
		for (const [k, v] of Object.entries(vars)) {
			text = text.replaceAll(`{${k}}`, String(v));
		}
	}
	return text;
}

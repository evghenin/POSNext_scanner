import java.net.URI

plugins {
	id("com.android.application")
}

val scannerHost: String =
	(findProperty("scanner.host") as String?)?.trimEnd('/')
		?: "https://erp.hotel-life.md"
// Optional hosted PWA path — used only by the TWA flavor. Offline WebView APK ignores this.
val scannerPath: String =
	(findProperty("scanner.path") as String?)?.let { if (it.startsWith("/")) it else "/$it" }
		?: ""
val scannerOrigin =
	try {
		val uri = URI(scannerHost)
		"${uri.scheme}://${uri.authority}"
	} catch (_: Exception) {
		scannerHost
	}
// TWA DEFAULT_URL still needs a concrete page when a hosted PWA exists.
val scannerUrl =
	if (scannerPath.isEmpty()) scannerOrigin else "$scannerOrigin$scannerPath"

android {
	namespace = "me.brainwise.posnext.scanner"
	compileSdk = 35

	defaultConfig {
		applicationId = "me.brainwise.posnext.scanner"
		minSdk = 26
		targetSdk = 35
		versionCode = 20
		versionName = "0.3.11"
		buildConfigField("String", "SCANNER_URL", "\"$scannerUrl\"")
		buildConfigField("String", "SCANNER_ORIGIN", "\"$scannerOrigin\"")
		manifestPlaceholders["scannerUrl"] = scannerUrl
		manifestPlaceholders["scannerHost"] = scannerHost.removePrefix("https://").removePrefix("http://")
		val assetStatements =
			"""[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"web","site":"$scannerOrigin"}}]"""
		resValue("string", "asset_statements", assetStatements)
	}

	flavorDimensions += "shell"
	productFlavors {
		create("prod") {
			dimension = "shell"
			// No applicationId / versionName suffixes — production sideload package id.
			buildConfigField("boolean", "USE_TWA", "false")
			buildConfigField("boolean", "IS_PRODUCTION", "true")
		}
		create("demo") {
			dimension = "shell"
			applicationIdSuffix = ".demo"
			versionNameSuffix = "-demo"
			buildConfigField("boolean", "USE_TWA", "false")
			buildConfigField("boolean", "IS_PRODUCTION", "false")
		}
		create("twa") {
			dimension = "shell"
			buildConfigField("boolean", "USE_TWA", "true")
			buildConfigField("boolean", "IS_PRODUCTION", "false")
		}
	}

	signingConfigs {
		getByName("debug")
	}

	buildTypes {
		release {
			isMinifyEnabled = false
			proguardFiles(
				getDefaultProguardFile("proguard-android-optimize.txt"),
				"proguard-rules.pro",
			)
			// Sideload until a store upload keystore is wired via local.properties / CI.
			signingConfig = signingConfigs.getByName("debug")
		}
		debug {
			applicationIdSuffix = ".debug"
			versionNameSuffix = "-debug"
		}
	}

	compileOptions {
		sourceCompatibility = JavaVersion.VERSION_17
		targetCompatibility = JavaVersion.VERSION_17
	}

	buildFeatures {
		buildConfig = true
	}

	packaging {
		resources {
			excludes += "/META-INF/{AL2.0,LGPL2.1}"
		}
	}
}

dependencies {
	implementation("androidx.appcompat:appcompat:1.7.0")
	implementation("androidx.activity:activity:1.9.3")
	implementation("androidx.webkit:webkit:1.12.1")
	implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")

	implementation(platform("org.jetbrains.kotlin:kotlin-bom:1.9.25"))
	constraints {
		implementation("org.jetbrains.kotlin:kotlin-stdlib") {
			because("Avoid duplicate kotlin-stdlib-jdk7/8 classes on the classpath")
		}
	}
}

configurations.all {
	exclude(group = "org.jetbrains.kotlin", module = "kotlin-stdlib-jdk7")
	exclude(group = "org.jetbrains.kotlin", module = "kotlin-stdlib-jdk8")
}

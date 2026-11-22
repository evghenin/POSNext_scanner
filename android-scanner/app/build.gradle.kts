import java.net.URI

plugins {
	id("com.android.application")
}

val scannerHost: String =
	(findProperty("scanner.host") as String?)?.trimEnd('/')
		?: "https://example.com"
val scannerPath: String =
	(findProperty("scanner.path") as String?)?.let { if (it.startsWith("/")) it else "/$it" }
		?: "/pos-scanner"
val scannerUrl = "$scannerHost$scannerPath"
val scannerOrigin =
	try {
		val uri = URI(scannerHost)
		"${uri.scheme}://${uri.authority}"
	} catch (_: Exception) {
		scannerHost
	}

android {
	namespace = "me.brainwise.posnext.scanner"
	compileSdk = 35

	defaultConfig {
		applicationId = "me.brainwise.posnext.scanner"
		minSdk = 26
		targetSdk = 35
		versionCode = 1
		versionName = "0.1.0"
		buildConfigField("String", "SCANNER_URL", "\"$scannerUrl\"")
		buildConfigField("String", "SCANNER_ORIGIN", "\"$scannerOrigin\"")
		manifestPlaceholders["scannerUrl"] = scannerUrl
		manifestPlaceholders["scannerHost"] = scannerHost.removePrefix("https://").removePrefix("http://")
		// App-side Digital Asset Links statement (website must publish matching assetlinks.json)
		val assetStatements =
			"""[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"web","site":"$scannerOrigin"}}]"""
		resValue("string", "asset_statements", assetStatements)
	}

	flavorDimensions += "shell"
	productFlavors {
		create("demo") {
			dimension = "shell"
			applicationIdSuffix = ".demo"
			versionNameSuffix = "-demo"
			buildConfigField("boolean", "USE_TWA", "false")
		}
		create("twa") {
			dimension = "shell"
			buildConfigField("boolean", "USE_TWA", "true")
		}
	}

	buildTypes {
		release {
			isMinifyEnabled = false
			proguardFiles(
				getDefaultProguardFile("proguard-android-optimize.txt"),
				"proguard-rules.pro",
			)
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

	// Align Kotlin stdlib pulled transitively by browserhelper / AndroidX
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

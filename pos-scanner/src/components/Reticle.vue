<template>
	<div class="reticle" aria-hidden="true">
		<div class="reticle__frame">
			<span class="c tl" /><span class="c tr" /><span class="c bl" /><span class="c br" />
			<div class="reticle__scanline" />
		</div>
		<p class="reticle__hint">Наведите на штрихкод или печатный SKU#####</p>
	</div>
</template>

<style scoped>
.reticle {
	pointer-events: none;
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
	background: radial-gradient(ellipse at center, transparent 28%, rgba(5, 10, 20, 0.55) 70%);
}

.reticle__frame {
	position: relative;
	width: min(78vw, 360px);
	height: min(22vh, 140px);
	border: 1px solid rgba(94, 234, 212, 0.25);
	border-radius: 12px;
	overflow: hidden;
	box-shadow: 0 0 0 999px rgba(5, 10, 20, 0.35);
}

.c {
	position: absolute;
	width: 22px;
	height: 22px;
	border: 3px solid var(--reticle);
}
.tl {
	top: -1px;
	left: -1px;
	border-right: 0;
	border-bottom: 0;
	border-radius: 8px 0 0 0;
}
.tr {
	top: -1px;
	right: -1px;
	border-left: 0;
	border-bottom: 0;
	border-radius: 0 8px 0 0;
}
.bl {
	bottom: -1px;
	left: -1px;
	border-right: 0;
	border-top: 0;
	border-radius: 0 0 0 8px;
}
.br {
	bottom: -1px;
	right: -1px;
	border-left: 0;
	border-top: 0;
	border-radius: 0 0 8px 0;
}

.reticle__scanline {
	position: absolute;
	left: 8%;
	right: 8%;
	height: 2px;
	background: linear-gradient(90deg, transparent, var(--accent), transparent);
	animation: sweep 2.2s ease-in-out infinite;
	opacity: 0.85;
}

@keyframes sweep {
	0%,
	100% {
		top: 18%;
	}
	50% {
		top: 78%;
	}
}

.reticle__hint {
	position: absolute;
	bottom: max(18vh, 120px);
	margin: 0;
	padding: 0 1rem;
	text-align: center;
	color: var(--fg);
	font-size: 0.92rem;
	text-shadow: 0 1px 8px rgba(0, 0, 0, 0.8);
}
</style>

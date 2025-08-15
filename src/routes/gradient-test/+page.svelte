<script>
</script>

<main class="relative flex min-h-screen flex-col items-center justify-center p-4">
	<div class="gradient-background">
		<h1>Gradient Test</h1>
		<p>This is a test page for gradient backgrounds.</p>
	</div>
</main>

<style>
	.gradient-background::before {
		content: '';
		z-index: 1;
		border-radius: clamp(330px, 45vw, 661.323px);
		background: linear-gradient(
			90deg,
			#217bfe4d 5.18%,
			#078efb4d 31.68%,
			#ac87eb4d 54.88%,
			#ee4d5d4d 96.92%
		);
		filter: blur(clamp(75px, 10vw, 150px));
		position: absolute;
		left: clamp(-400px, -40vw, -550px);
		top: clamp(0px, 5vw, 50px);
		width: clamp(330px, 45vw, 661.323px);
		height: clamp(295px, 41vw, 589.722px);
		transform: rotate(-61.215deg);
		content: '';
	}

	.gradient-background::after {
		content: '';
		position: absolute;
		right: clamp(-275px, -38vw, -550px);
		bottom: clamp(-15px, -2vw, -30px);
		width: clamp(270px, 37vw, 536.679px);
		height: clamp(220px, 31vw, 446.697px);
		transform: rotate(15.25deg);
		border-radius: clamp(270px, 37vw, 536.679px);
		opacity: 0.89;
		background: linear-gradient(
			90deg,
			#15a82266 5.18%,
			#14bbee66 31.68%,
			#0aed3b66 54.88%,
			#0fe84d66 96.92%
		);
		filter: blur(clamp(75px, 10vw, 150px));
	}
</style>

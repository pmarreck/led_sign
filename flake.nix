{
	description = "Offline LED sign with a Zig WebAssembly renderer";
	inputs.nixpkgs.url = "github:NixOS/nixpkgs/9fbb54b33e91ee4ca368e35a78e0613c720600b3";
	outputs = { self, nixpkgs }: let
		systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ];
		forAll = nixpkgs.lib.genAttrs systems;
		pkgsFor = system: import nixpkgs { inherit system; };
		# Headless Chromium for browser smoke tests; nixpkgs builds it for Linux only.
		browserFor = pkgs: pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.chromium ];
		browserEnv = pkgs: pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux { LED_SIGN_CHROMIUM = "${pkgs.chromium}/bin/chromium"; };
		sourceFor = pkgs: pkgs.lib.fileset.toSource {
			root = ./.;
			fileset = pkgs.lib.fileset.unions [ ./src ./web ./tests ./scripts ./build.zig ./test ./build ./bin ./VERSION ];
		};
		zigEnv = ''
			export HOME="$TMPDIR"
			export ZIG_GLOBAL_CACHE_DIR="$TMPDIR/zig-global"
			export ZIG_LOCAL_CACHE_DIR="$TMPDIR/zig-local"
		'';
	in {
		packages = forAll (system: let pkgs = pkgsFor system; in {
			default = pkgs.stdenvNoCC.mkDerivation {
				pname = "led-sign";
				version = pkgs.lib.fileContents ./VERSION;
				src = sourceFor pkgs;
				strictDeps = true;
				nativeBuildInputs = [ pkgs.zig_0_16 pkgs.nodejs ];
				buildInputs = [ pkgs.bash ];
				LED_SIGN_ENV = "1";
				dontConfigure = true;
				buildPhase = ''
					${zigEnv}
					patchShebangs scripts
					bash scripts/build-web
				'';
				# Same relative layout as a checkout, so bin/led-sign finds dist/ and
				# scripts/serve.mjs beside it; Node is pinned instead of entering Nix.
				installPhase = ''
					mkdir -p "$out/bin" "$out/scripts"
					cp -R dist "$out/dist"
					cp VERSION "$out/VERSION"
					cp scripts/serve.mjs "$out/scripts/"
					cp bin/led-sign "$out/bin/led-sign"
					substituteInPlace "$out/bin/led-sign" --replace-fail "packaged_node='''" "packaged_node='${pkgs.nodejs}/bin/node'"
					patchShebangs "$out/bin"
				'';
				doInstallCheck = true;
				installCheckPhase = ''"$out/bin/led-sign" --about | grep -q "^led-sign ${pkgs.lib.fileContents ./VERSION}: "'';
				meta.mainProgram = "led-sign";
			};
		});
		checks = forAll (system: let pkgs = pkgsFor system; in {
			package = self.packages.${system}.default;
			test = pkgs.stdenvNoCC.mkDerivation ({
				name = "led-sign-test";
				src = sourceFor pkgs;
				nativeBuildInputs = [ pkgs.zig_0_16 pkgs.nodejs ] ++ browserFor pkgs;
				LED_SIGN_ENV = "1";
				FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
				dontConfigure = true;
				buildPhase = ''
					${zigEnv}
					patchShebangs scripts test bin tests
					bash ./test
				'';
				installPhase = ''mkdir -p "$out"; echo "tests passed" > "$out/result"'';
			} // browserEnv pkgs);
		});
		devShells = forAll (system: let pkgs = pkgsFor system; in {
			default = pkgs.mkShell ({
				packages = [ pkgs.zig_0_16 pkgs.nodejs ] ++ browserFor pkgs;
				LED_SIGN_ENV = "1";
			} // browserEnv pkgs);
		});
	};
}

SHELL:=bash

CC=gcc
CFLAGS=-Wall -O3 -std=c99 -s -Wno-unused-result -Wno-parentheses
LDFLAGS=-lm

NATIVE_BASENAME?=sameshi-cli
NATIVE_BIN=$(NATIVE_BASENAME)

EMCC?=emcc
EMSDK_ROOT?=/tmp/emsdk
SOURCE_DATE_EPOCH?=1704067200
WASM_OUT_DIR?=../artifacts/wasm
WASM_BASENAME?=sameshi-engine
WASM_ARTIFACT=$(WASM_OUT_DIR)/$(WASM_BASENAME).wasm
WASM_SOURCE=shim/shim.c
SAMESHI_INCLUDE=sameshi
SAMESHI_MAIN=sameshi/main.c
SAMESHI_HEADER=sameshi/sameshi.h

WASM_EXPORTED_FUNCTIONS='["_shim_input_ptr","_shim_input_capacity","_shim_output_ptr","_shim_output_capacity","_shim_last_error","_shim_side_to_move","_shim_error_message","_shim_request_stop","_shim_clear_stop","_shim_set_position","_shim_generate_moves","_shim_best_move","_shim_is_in_check"]'
WASM_CFLAGS=-O3 -std=c99 -s STANDALONE_WASM=1 -s FILESYSTEM=0 -s EXPORTED_FUNCTIONS=$(WASM_EXPORTED_FUNCTIONS) -s ERROR_ON_UNDEFINED_SYMBOLS=0 -Wl,--no-entry

all: $(NATIVE_BIN)

$(NATIVE_BIN): $(SAMESHI_MAIN) $(SAMESHI_HEADER)
	$(CC) $(CFLAGS) $(SAMESHI_MAIN) -o $(NATIVE_BIN) $(LDFLAGS)

$(WASM_OUT_DIR):
	mkdir -p $(WASM_OUT_DIR)

wasm: $(WASM_ARTIFACT)

$(WASM_ARTIFACT): $(WASM_SOURCE) $(SAMESHI_HEADER) | $(WASM_OUT_DIR)
	@set -euo pipefail; \
	if command -v $(EMCC) >/dev/null 2>&1; then \
		EMCC_BIN="$(EMCC)"; \
	elif [ -f "$(EMSDK_ROOT)/emsdk_env.sh" ]; then \
		source "$(EMSDK_ROOT)/emsdk_env.sh" >/dev/null; \
		EMCC_BIN="$$(command -v emcc)"; \
	else \
		echo "emcc not found and $(EMSDK_ROOT)/emsdk_env.sh is missing" >&2; \
		exit 1; \
	fi; \
	SOURCE_DATE_EPOCH=$(SOURCE_DATE_EPOCH) "$$EMCC_BIN" $(WASM_CFLAGS) -I$(SAMESHI_INCLUDE) $(WASM_SOURCE) -o $(WASM_ARTIFACT)

run: $(NATIVE_BIN)
	./$(NATIVE_BIN)

clean:
	rm -f $(NATIVE_BIN)

clean-wasm:
	rm -rf $(WASM_OUT_DIR)

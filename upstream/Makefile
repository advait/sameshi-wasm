CC=gcc
CFLAGS=-Wall -O3 -std=c99 -s -Wno-unused-result -Wno-parentheses
LDFLAGS=-lm

EMCC?=emcc
SOURCE_DATE_EPOCH?=1704067200
WASM_OUT_DIR?=../artifacts/wasm
WASM_BASENAME?=sameshi-engine
WASM_ARTIFACT=$(WASM_OUT_DIR)/$(WASM_BASENAME).wasm

WASM_EXPORTED_FUNCTIONS='["_shim_input_ptr","_shim_input_capacity","_shim_output_ptr","_shim_output_capacity","_shim_last_error","_shim_side_to_move","_shim_error_message","_shim_request_stop","_shim_clear_stop","_shim_set_position","_shim_generate_moves","_shim_best_move","_shim_is_in_check"]'
WASM_CFLAGS=-O3 -std=c99 -s STANDALONE_WASM=1 -s FILESYSTEM=0 -s EXPORTED_FUNCTIONS=$(WASM_EXPORTED_FUNCTIONS) -s ERROR_ON_UNDEFINED_SYMBOLS=0 -Wl,--no-entry

all: sameshi

sameshi: main.c sameshi.h
	$(CC) $(CFLAGS) main.c -o sameshi $(LDFLAGS)

$(WASM_OUT_DIR):
	mkdir -p $(WASM_OUT_DIR)

wasm: $(WASM_ARTIFACT)

$(WASM_ARTIFACT): shim.c sameshi.h | $(WASM_OUT_DIR)
	SOURCE_DATE_EPOCH=$(SOURCE_DATE_EPOCH) $(EMCC) $(WASM_CFLAGS) shim.c -o $(WASM_ARTIFACT)

run: sameshi
	./sameshi

clean:
	rm -f sameshi

clean-wasm:
	rm -rf $(WASM_OUT_DIR)

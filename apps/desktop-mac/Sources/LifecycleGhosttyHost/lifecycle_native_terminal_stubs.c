#include <stdint.h>
#include <stdlib.h>

char *lifecycle_native_terminal_prepare_paste_image(const char *terminal_id,
                                                    const char *file_name,
                                                    const char *media_type,
                                                    const uint8_t *bytes,
                                                    size_t bytes_len) {
  (void)terminal_id;
  (void)file_name;
  (void)media_type;
  (void)bytes;
  (void)bytes_len;
  return NULL;
}

void lifecycle_native_terminal_free_string(char *value) {
  free(value);
}

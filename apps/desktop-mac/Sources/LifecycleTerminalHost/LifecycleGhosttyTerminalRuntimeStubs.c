#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

static int lifecycle_is_safe_filename_char(char value) {
  return (value >= 'a' && value <= 'z') || (value >= 'A' && value <= 'Z') ||
         (value >= '0' && value <= '9') || value == '.' || value == '-' || value == '_';
}

static const char *lifecycle_extension_for_media_type(const char *media_type) {
  if (media_type == NULL) {
    return "png";
  }

  if (strcmp(media_type, "image/jpeg") == 0) return "jpg";
  if (strcmp(media_type, "image/gif") == 0) return "gif";
  if (strcmp(media_type, "image/webp") == 0) return "webp";
  if (strcmp(media_type, "image/bmp") == 0) return "bmp";
  if (strcmp(media_type, "image/tiff") == 0) return "tiff";
  if (strcmp(media_type, "image/heic") == 0) return "heic";
  if (strcmp(media_type, "image/heif") == 0) return "heif";
  if (strcmp(media_type, "image/avif") == 0) return "avif";
  if (strcmp(media_type, "image/svg+xml") == 0) return "svg";
  return "png";
}

static char *lifecycle_sanitized_file_name(const char *file_name, const char *media_type) {
  const char *fallback_extension = lifecycle_extension_for_media_type(media_type);
  const char *fallback_prefix = "pasted-image";
  const char *source = file_name != NULL && file_name[0] != '\0' ? file_name : fallback_prefix;
  size_t source_len = strlen(source);
  size_t max_len = source_len > 96 ? 96 : source_len;
  size_t capacity = max_len + strlen(fallback_extension) + 2;
  char *result = (char *)malloc(capacity);
  if (result == NULL) {
    return NULL;
  }

  size_t length = 0;
  for (size_t index = 0; index < max_len; index += 1) {
    char value = source[index];
    if (value == '/' || value == '\\' || value == ':') {
      result[length++] = '-';
    } else if (lifecycle_is_safe_filename_char(value)) {
      result[length++] = value;
    } else {
      result[length++] = '_';
    }
  }

  if (length == 0) {
    size_t fallback_len = strlen(fallback_prefix);
    memcpy(result, fallback_prefix, fallback_len);
    length = fallback_len;
  }

  result[length] = '\0';
  if (strrchr(result, '.') == NULL) {
    result[length++] = '.';
    strcpy(result + length, fallback_extension);
  }

  return result;
}

static char *lifecycle_shell_escape_path(const char *path) {
  size_t length = 2;
  for (const char *cursor = path; *cursor != '\0'; cursor += 1) {
    length += *cursor == '\'' ? 4 : 1;
  }

  char *escaped = (char *)malloc(length + 1);
  if (escaped == NULL) {
    return NULL;
  }

  char *out = escaped;
  *out++ = '\'';
  for (const char *cursor = path; *cursor != '\0'; cursor += 1) {
    if (*cursor == '\'') {
      memcpy(out, "'\\''", 4);
      out += 4;
    } else {
      *out++ = *cursor;
    }
  }
  *out++ = '\'';
  *out = '\0';
  return escaped;
}

char *lifecycle_ghostty_terminal_prepare_paste_image(const char *terminal_id,
                                                    const char *file_name,
                                                    const char *media_type,
                                                    const uint8_t *bytes,
                                                    size_t bytes_len) {
  (void)terminal_id;
  if (bytes == NULL || bytes_len == 0) {
    return NULL;
  }

  const char *tmpdir = getenv("TMPDIR");
  if (tmpdir == NULL || tmpdir[0] == '\0') {
    tmpdir = "/tmp";
  }

  char *template_path = NULL;
  if (asprintf(&template_path, "%s/lifecycle-terminal-paste-XXXXXX", tmpdir) < 0) {
    return NULL;
  }

  char *directory = mkdtemp(template_path);
  if (directory == NULL) {
    free(template_path);
    return NULL;
  }

  char *safe_name = lifecycle_sanitized_file_name(file_name, media_type);
  if (safe_name == NULL) {
    free(template_path);
    return NULL;
  }

  char *path = NULL;
  if (asprintf(&path, "%s/%s", directory, safe_name) < 0) {
    free(safe_name);
    free(template_path);
    return NULL;
  }

  FILE *file = fopen(path, "wb");
  if (file == NULL) {
    free(path);
    free(safe_name);
    free(template_path);
    return NULL;
  }

  size_t written = fwrite(bytes, 1, bytes_len, file);
  int close_result = fclose(file);
  if (written != bytes_len || close_result != 0) {
    unlink(path);
    free(path);
    free(safe_name);
    free(template_path);
    return NULL;
  }

  chmod(path, S_IRUSR | S_IWUSR);
  char *escaped = lifecycle_shell_escape_path(path);
  free(path);
  free(safe_name);
  free(template_path);
  return escaped;
}

void lifecycle_ghostty_terminal_free_string(char *value) {
  free(value);
}

#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdlib.h>
#include <string.h>

static char *(*real_strtok)(char *, const char *) = NULL;

static __thread char *saved_rest = NULL;
static __thread int saved_active = 0;
/*
 * login_patch_used: set to 1 after we intercept an email:password split.
 * Prevents the patch from activating again on the continuation call (str=NULL)
 * that passes the same ':' delimiter, which would be a normal strtok sequence.
 * Reset to 0 when the two-token sequence completes so the patch can activate
 * again if needed (defensive; containers are single-shot in practice).
 */
static __thread int login_patch_used = 0;

__attribute__((constructor)) static void clear_ld_preload(void) {
  unsetenv("LD_PRELOAD");
}

char *strtok(char *str, const char *delim) {
  if (real_strtok == NULL) {
    real_strtok = dlsym(RTLD_NEXT, "strtok");
  }

  if (delim != NULL && strcmp(delim, ":") == 0) {
    if (str != NULL) {
      if (login_patch_used || strchr(str, '@') == NULL) {
        saved_active = 0;
        saved_rest = NULL;
        return real_strtok(str, delim);
      }
      char *first_colon = strchr(str, ':');
      if (first_colon == NULL) {
        saved_active = 0;
        saved_rest = NULL;
        return real_strtok(str, delim);
      }
      *first_colon = '\0';
      saved_rest = first_colon + 1;
      saved_active = 1;
      login_patch_used = 1;
      return str;
    }

    if (saved_active) {
      saved_active = 0;
      /* Sequence complete: reset so patch can fire again on a new call. */
      login_patch_used = 0;
      if (saved_rest == NULL || *saved_rest == '\0') {
        saved_rest = NULL;
        return NULL;
      }
      char *ret = saved_rest;
      saved_rest = NULL;
      return ret;
    }
  }

  saved_active = 0;
  saved_rest = NULL;
  return real_strtok(str, delim);
}

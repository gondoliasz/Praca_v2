suppressMessages({
  library(ggplot2)
  library(stats)
  # optional: library(car) etc.
})

# Save plot helper (tries ggsave, falls back to base PNG)
save_plot <- function(plot_obj, out_path, width=800, height=600) {
  tryCatch({
    ggsave(filename = out_path, plot = plot_obj, width = width/72, height = height/72, dpi = 72, units = "in")
  }, error = function(e) {
    png(filename = out_path, width = width, height = height)
    print(plot_obj)
    dev.off()
  })
}

# Clean column names: remove BOM, zero-width and NBSP, trim whitespace
.clean_colnames <- function(cols) {
  if (is.null(cols)) return(cols)
  cols <- gsub("\ufeff", "", cols, fixed = TRUE)   # BOM
  cols <- gsub("\u200b", "", cols, fixed = TRUE)   # zero-width space
  cols <- gsub("\u00a0", " ", cols, fixed = TRUE)  # non-breaking space -> normal space
  cols <- trimws(cols)
  return(cols)
}

# Deterministic transliteration for Polish diacritics (lower + upper)
.remove_pl_diakrytyki <- function(s) {
  if (is.null(s)) return(s)
  s <- as.character(s)
  s <- gsub("ą", "a", s, fixed = TRUE)
  s <- gsub("ć", "c", s, fixed = TRUE)
  s <- gsub("ę", "e", s, fixed = TRUE)
  s <- gsub("ł", "l", s, fixed = TRUE)
  s <- gsub("ń", "n", s, fixed = TRUE)
  s <- gsub("ó", "o", s, fixed = TRUE)
  s <- gsub("ś", "s", s, fixed = TRUE)
  s <- gsub("ż", "z", s, fixed = TRUE)
  s <- gsub("ź", "z", s, fixed = TRUE)
  s <- gsub("Ą", "A", s, fixed = TRUE)
  s <- gsub("Ć", "C", s, fixed = TRUE)
  s <- gsub("Ę", "E", s, fixed = TRUE)
  s <- gsub("Ł", "L", s, fixed = TRUE)
  s <- gsub("Ń", "N", s, fixed = TRUE)
  s <- gsub("Ó", "O", s, fixed = TRUE)
  s <- gsub("Ś", "S", s, fixed = TRUE)
  s <- gsub("Ż", "Z", s, fixed = TRUE)
  s <- gsub("Ź", "Z", s, fixed = TRUE)
  return(s)
}

# Safe key for matching: remove diacritics, drop non-alphanumeric, lowercase
.safe_key <- function(s) {
  if (is.null(s)) return(NA_character_)
  ss <- as.character(s)
  ss2 <- .remove_pl_diakrytyki(ss)
  ss2 <- gsub("[^[:alnum:]]+", "", ss2)
  ss2 <- tolower(ss2)
  return(ss2)
}

# Quote name for aes_string: if name is syntactic (letters/digits/._) return as-is,
# otherwise wrap in backticks so parse() treats it as a name, not code.
.aesthetic_name <- function(n) {
  if (is.null(n)) return(n)
  n <- as.character(n)
  if (grepl("^[A-Za-z0-9_\\.]+$", n)) {
    return(n)
  }
  n_escaped <- gsub("`", "\\\\`", n, fixed = TRUE)
  return(paste0("`", n_escaped, "`"))
}

# Heuristics to coerce character/factor column to numeric:
# - remove spaces and NBSP
# - handle thousands separators and decimal comma/dot
# - strip other non-numeric characters
.coerce_numeric_if_possible <- function(vec) {
  # if already numeric, return as is
  if (is.numeric(vec)) return(vec)

  # convert factors to character
  if (is.factor(vec)) vec_ch <- as.character(vec) else vec_ch <- as.character(vec)
  # remove NBSP and whitespace
  vec_ch <- gsub("\u00a0", "", vec_ch, fixed = TRUE)
  vec_ch <- gsub("\\s+", "", vec_ch)
  # empty strings -> NA
  vec_ch[vec_ch == ""] <- NA_character_

  coerce_one <- function(s) {
    if (is.na(s)) return(NA_real_)
    # if contains both '.' and ',' assume '.' thousands and ',' decimal -> remove dots, replace comma with dot
    if (grepl("\\.", s) && grepl(",", s)) {
      s2 <- gsub("\\.", "", s)
      s2 <- gsub(",", ".", s2, fixed = TRUE)
    } else if (grepl(",", s) && !grepl("\\.", s)) {
      # comma as decimal separator
      s2 <- gsub(",", ".", s, fixed = TRUE)
    } else if (grepl("\\.", s) && length(gregexpr("\\.", s)[[1]]) > 1) {
      # multiple dots -> likely thousands separators
      s2 <- gsub("\\.", "", s)
    } else {
      s2 <- s
    }
    # remove any remaining non-digit/decimal/minus
    s2 <- gsub("[^0-9\\.\\-]", "", s2)
    # protect against lone "-" or "." which coerce to NA
    if (s2 == "" || s2 == "-" || s2 == "." || s2 == "-.") return(NA_real_)
    suppressWarnings(as.numeric(s2))
  }

  coerced <- vapply(vec_ch, coerce_one, FUN.VALUE = numeric(1), USE.NAMES = FALSE)

  # check proportion of successful coercion
  n_total <- length(coerced)
  n_good <- sum(!is.na(coerced))
  # if at least 70% non-NA after coercion and at least 3 values coerced, accept conversion
  if (n_good >= 3 && (n_good / max(1, n_total)) >= 0.7) {
    return(coerced)
  }
  # otherwise return original vector unchanged
  return(vec)
}

# Robust CSV reader: attempts file(..., encoding=...) and many fallbacks
read_csv_auto <- function(path, encoding = NULL, delimiter = NULL) {
  safe_read_table <- function(sep, use_encoding = NULL) {
    if (!is.null(use_encoding) && nzchar(use_encoding)) {
      con <- tryCatch(file(path, open = "r", encoding = use_encoding), error = function(e) e)
      if (inherits(con, "error")) return(con)
      on.exit(tryCatch(close(con), error = function(e) NULL))
      return(tryCatch(read.table(con, sep = sep, header = TRUE, stringsAsFactors = FALSE, check.names = FALSE),
                      error = function(e) e))
    } else {
      return(tryCatch(read.table(path, sep = sep, header = TRUE, stringsAsFactors = FALSE, check.names = FALSE),
                      error = function(e) e))
    }
  }

  safe_read_csv <- function(use_encoding = NULL) {
    if (!is.null(use_encoding) && nzchar(use_encoding)) {
      con <- tryCatch(file(path, open = "r", encoding = use_encoding), error = function(e) e)
      if (inherits(con, "error")) return(con)
      on.exit(tryCatch(close(con), error = function(e) NULL))
      return(tryCatch(read.csv(con, stringsAsFactors = FALSE, check.names = FALSE),
                      error = function(e) e))
    } else {
      return(tryCatch(read.csv(path, stringsAsFactors = FALSE, check.names = FALSE),
                      error = function(e) e))
    }
  }

  safe_read_csv2 <- function(use_encoding = NULL) {
    if (!is.null(use_encoding) && nzchar(use_encoding)) {
      con <- tryCatch(file(path, open = "r", encoding = use_encoding), error = function(e) e)
      if (inherits(con, "error")) return(con)
      on.exit(tryCatch(close(con), error = function(e) NULL))
      return(tryCatch(read.csv2(con, stringsAsFactors = FALSE, check.names = FALSE),
                      error = function(e) e))
    } else {
      return(tryCatch(read.csv2(path, stringsAsFactors = FALSE, check.names = FALSE),
                      error = function(e) e))
    }
  }

  # try explicit delimiter+encoding
  if (!is.null(delimiter) && nzchar(delimiter)) {
    if (!is.null(encoding) && nzchar(encoding)) {
      res <- safe_read_table(delimiter, encoding)
      if (!inherits(res, "error")) return(res)
    } else {
      res <- safe_read_table(delimiter, NULL)
      if (!inherits(res, "error")) return(res)
    }
  }

  if (!is.null(encoding) && nzchar(encoding)) {
    res <- safe_read_csv(encoding)
    if (!inherits(res, "error")) return(res)
    res <- safe_read_table(",", encoding)
    if (!inherits(res, "error")) return(res)
    res <- safe_read_csv2(encoding)
    if (!inherits(res, "error")) return(res)
  }

  res <- safe_read_csv(NULL)
  if (!inherits(res, "error")) return(res)
  res <- safe_read_csv2(NULL)
  if (!inherits(res, "error")) return(res)
  res <- safe_read_table(",", NULL)
  if (!inherits(res, "error")) return(res)

  first_line <- tryCatch(readLines(path, n = 1, warn = FALSE), error = function(e) "")
  sep <- ","
  if (grepl(";", first_line) && !grepl(",", first_line)) sep <- ";"
  res <- tryCatch(read.table(path, sep = sep, header = TRUE, stringsAsFactors = FALSE, check.names = FALSE), error = function(e) e)
  if (!inherits(res, "error")) return(res)

  stop("Failed to read CSV with available strategies.")
}

# Resolve requested column name robustly (exact, case-insensitive, diacritics-stripped)
resolve_by_safe <- function(sent, cols) {
  if (is.null(sent)) return(NULL)
  s <- as.character(sent)
  if (s %in% cols) return(s)
  lowcols <- tolower(cols)
  if (tolower(s) %in% lowcols) return(cols[which(lowcols == tolower(s))[1]])
  safe_cols <- vapply(cols, .safe_key, FUN.VALUE = character(1), USE.NAMES = FALSE)
  safe_sent <- .safe_key(s)
  idx <- which(safe_cols == safe_sent)
  if (length(idx) >= 1) return(cols[idx[1]])
  try({
    sdp <- as.character(deparse(sent))
    if (sdp %in% cols) return(sdp)
  }, silent = TRUE)
  return(NULL)
}

# Main analysis function called from Python via rpy2
run_analysis <- function(csv_path, xname, yname, plots_dir = "plots", encoding = NULL, delimiter = NULL) {
  if (is.null(plots_dir) || plots_dir == "") plots_dir <- "plots"
  dir.create(plots_dir, showWarnings = FALSE, recursive = TRUE)

  df <- tryCatch({
    read_csv_auto(csv_path, encoding, delimiter)
  }, error = function(e) {
    stop(paste0("Failed to read CSV: ", e$message))
  })

  # Clean column names
  names(df) <- .clean_colnames(names(df))
  cols <- names(df)

  # Try to resolve x/y as indices if numeric or coercible
  actual_x <- NULL
  actual_y <- NULL

  to_index <- function(v, ncols) {
    if (is.null(v)) return(NA_integer_)
    if (is.numeric(v)) {
      iv <- as.integer(v)
      if (!is.na(iv) && iv >= 1 && iv <= ncols) return(iv)
    }
    sv <- tryCatch(as.character(v), error = function(e) NA_character_)
    if (!is.na(sv)) {
      iv <- suppressWarnings(as.integer(sv))
      if (!is.na(iv) && iv >= 1 && iv <= ncols) return(iv)
    }
    return(NA_integer_)
  }

  nx <- to_index(xname, ncol(df))
  ny <- to_index(yname, ncol(df))
  if (!is.na(nx)) actual_x <- names(df)[nx]
  if (!is.na(ny)) actual_y <- names(df)[ny]

  # If indices not given/invalid, try name-based resolution
  if (is.null(actual_x)) {
    x_chr <- tryCatch(as.character(xname), error = function(e) as.character(deparse(xname)))
    actual_x <- resolve_by_safe(x_chr, cols)
  }
  if (is.null(actual_y)) {
    y_chr <- tryCatch(as.character(yname), error = function(e) as.character(deparse(yname)))
    actual_y <- resolve_by_safe(y_chr, cols)
  }

  if (is.null(actual_x) || is.null(actual_y)) {
    stop(paste0("Column(s) not found. Requested: ", as.character(xname), ", ", as.character(yname), ". Available columns: ", paste(cols, collapse = ",")))
  }

  if (!is.null(actual_x) && !identical(as.character(xname), actual_x)) {
    message(sprintf("[run_analysis] resolved x '%s' -> '%s'", as.character(xname), actual_x))
  }
  if (!is.null(actual_y) && !identical(as.character(yname), actual_y)) {
    message(sprintf("[run_analysis] resolved y '%s' -> '%s'", as.character(yname), actual_y))
  }

  # Extract columns
  x_raw <- df[[actual_x]]
  y_raw <- df[[actual_y]]

  # Try to coerce character/factor columns to numeric when appropriate
  x <- .coerce_numeric_if_possible(x_raw)
  y <- .coerce_numeric_if_possible(y_raw)

  # If coercion returned the same unchanged vector (non-numeric), keep original
  # (coerce returns original vector if conversion not appropriate)
  # Note: x and y are either numeric vectors or original vectors (character/factor)
  recommended <- ""
  stats_res <- list()
  p <- NULL

  safe_shapiro_p <- function(vec) {
    vec <- vec[!is.na(vec)]
    if (length(vec) < 3 || length(vec) > 5000) return(NA)
    pv <- tryCatch(shapiro.test(vec)$p.value, error = function(e) NA)
    return(as.numeric(pv))
  }

  get_variance_homog_p <- function(numcol, group) {
    pval <- NA
    if (requireNamespace("car", quietly = TRUE)) {
      lt <- tryCatch(car::leveneTest(numcol, as.factor(group))$"Pr(>F)"[1], error = function(e) NA)
      pval <- as.numeric(lt)
    } else {
      bt <- tryCatch(bartlett.test(numcol, as.factor(group))$p.value, error = function(e) NA)
      pval <- as.numeric(bt)
    }
    return(pval)
  }

  is_x_num <- is.numeric(x)
  is_y_num <- is.numeric(y)

  # For plotting, use aesthetic names quoted if necessary and protect with tryCatch
  ax_name <- .aesthetic_name(actual_x)
  ay_name <- .aesthetic_name(actual_y)

  if (is_x_num & is_y_num) {
    sh_x <- safe_shapiro_p(x)
    sh_y <- safe_shapiro_p(y)
    if (!is.na(sh_x) && !is.na(sh_y) && sh_x > 0.05 && sh_y > 0.05) {
      test <- cor.test(x, y, method = "pearson")
      recommended <- "pearson_correlation"
    } else {
      test <- cor.test(x, y, method = "spearman")
      recommended <- "spearman_correlation"
    }
    stats_res <- list(method = as.character(test$method),
                      statistic = as.numeric(test$statistic),
                      p_value = as.numeric(test$p.value),
                      estimate = as.numeric(if (!is.null(test$estimate)) test$estimate else NA))
    p <- tryCatch({
      ggplot(df, aes_string(x = ax_name, y = ay_name)) +
        geom_point(alpha = 0.6) +
        geom_smooth(method = "lm", se = TRUE, color = "blue") +
        ggtitle(paste("Scatter:", actual_x, "vs", actual_y))
    }, error = function(e) {
      message(sprintf("[run_analysis] plot creation failed: %s", e$message))
      NULL
    })
  } else if (!is_x_num & !is_y_num) {
    tab <- table(x, y)
    test <- tryCatch(chisq.test(tab), error = function(e) list(p.value = NA, statistic = NA))
    recommended <- "chi_square"
    stats_res <- list(method = "Chi-squared test",
                      statistic = ifelse(is.null(test$statistic), NA, as.numeric(test$statistic)),
                      p_value = ifelse(is.null(test$p.value), NA, as.numeric(test$p.value)))
    p <- NULL
  } else {
    if (!is_x_num) {
      catcol <- x; numcol <- y; cname <- actual_x; nname <- actual_y
      cname_aes <- ax_name; nname_aes <- ay_name
    } else {
      catcol <- y; numcol <- x; cname <- actual_y; nname <- actual_x
      cname_aes <- ay_name; nname_aes <- ax_name
    }

    group_levels <- unique(catcol)
    k <- length(group_levels)

    normal_by_group <- TRUE
    for (g in group_levels) {
      vec <- numcol[catcol == g]
      pv <- safe_shapiro_p(vec)
      if (is.na(pv) || pv <= 0.05) normal_by_group <- FALSE
    }

    levene_p <- get_variance_homog_p(numcol, catcol)

    if (k == 2) {
      if (normal_by_group) {
        if (!is.na(levene_p) && levene_p > 0.05) {
          ttest <- t.test(numcol ~ as.factor(catcol), var.equal = TRUE)
          recommended <- "t_student"
          test <- ttest
        } else {
          ttest <- t.test(numcol ~ as.factor(catcol), var.equal = FALSE)
          recommended <- "welch_t"
          test <- ttest
        }
        stats_res <- list(method = as.character(test$method),
                          statistic = as.numeric(test$statistic),
                          p_value = as.numeric(test$p.value),
                          estimate = as.numeric(if (!is.null(test$estimate)) test$estimate else NA))
      } else {
        wt <- wilcox.test(numcol ~ as.factor(catcol))
        recommended <- "wilcoxon"
        stats_res <- list(method = as.character(wt$method),
                          statistic = as.numeric(wt$statistic),
                          p_value = as.numeric(wt$p.value))
      }
      p <- tryCatch({
        ggplot(df, aes_string(x = cname_aes, y = nname_aes)) + geom_boxplot() + ggtitle(paste("Boxplot:", nname, "by", cname))
      }, error = function(e) {
        message(sprintf("[run_analysis] boxplot creation failed: %s", e$message))
        NULL
      })
    } else {
      if (normal_by_group && (!is.na(levene_p) && levene_p > 0.05)) {
        an <- aov(numcol ~ as.factor(catcol))
        test_summary <- summary(an)
        recommended <- "anova"
        fstat <- tryCatch({ as.numeric(test_summary[[1]][["F value"]][1]) }, error = function(e) NA)
        fp <- tryCatch({ as.numeric(test_summary[[1]][["Pr(>F)"]][1]) }, error = function(e) NA)
        stats_res <- list(method = "ANOVA", statistic = fstat, p_value = fp)
      } else {
        kw <- kruskal.test(numcol ~ as.factor(catcol))
        recommended <- "kruskal_wallis"
        stats_res <- list(method = as.character(kw$method),
                          statistic = as.numeric(kw$statistic),
                          p_value = as.numeric(kw$p.value))
      }
      p <- tryCatch({
        ggplot(df, aes_string(x = cname_aes, y = nname_aes)) + geom_boxplot() + ggtitle(paste("Boxplot:", nname, "by", cname))
      }, error = function(e) {
        message(sprintf("[run_analysis] boxplot creation failed: %s", e$message))
        NULL
      })
    }
  }

  # Save plot if created
  plot_filename <- ""
  if (!is.null(p)) {
    fname <- paste0("plot_", as.integer(Sys.time()), ".png")
    out <- file.path(plots_dir, fname)
    tryCatch({
      save_plot(p, out)
      plot_filename <- fname
    }, error = function(e) {
      plot_filename <- ""
    })
  }

  plot_char <- as.character(plot_filename)
  return(list(recommended_test = recommended, stats = stats_res, plot_path = plot_char))
}
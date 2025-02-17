const PREC = {
  primary: 8,
  unary: 7,
  exp: 6,
  multiplicative: 5,
  additive: 4,
  comparative: 3,
  and: 2,
  or: 1,
};
const multiplicative_operators = ["*", "/", "%", "<<", ">>", "&"];
const additive_operators = ["+", "-", "|", tok("#"), "||"];
const comparative_operators = [
  "<",
  "<=",
  "<>",
  "!=",
  "=",
  ">",
  ">=",
  "~",
  "!~",
  "~*",
  "!~*",
  "@>",
  "<@",
];

// Generate case insentitive match for SQL keyword
// In case of multiple word keyword provide a seq matcher
function kw(keyword, precedence=0) {
  if (keyword.toUpperCase() != keyword) {
    throw new Error(`Expected upper case keyword got ${keyword}`);
  }
  const words = keyword.split(" ");
  const regExps = words.map(createCaseInsensitiveRegex);

  const pattern = regExps.length == 1 ? regExps[0] : seq(...regExps);
  return precedence !== 0 ? token(prec(precedence, pattern)) : pattern
}

function createOrReplace(item) {
  if (item.toUpperCase() != item) {
    throw new Error(`Expected upper case item got ${item}`);
  }
  return alias(
    seq(
      createCaseInsensitiveRegex("CREATE"),
      field("replace", optional(createCaseInsensitiveRegex("OR REPLACE"))),
      createCaseInsensitiveRegex(item),
    ),
    `CREATE_OR_REPLACE_${item}`,
  );
}

function tok(keyword) {
  return token(prec(1, createCaseInsensitiveRegex(keyword)))
}

function createCaseInsensitiveRegex(word) {
  return new RegExp(
    word
      .replace(/\s+/g,' ')
      .trim()
      .split("")
      .map(letter =>
        letter === ' '
        ? '\\s+'
        : `[${letter.toLowerCase()}${letter.toUpperCase()}]`
      ).join("")
  );
}

function kv(key, value) {
  return value === null
      ? createCaseInsensitiveRegex(key)
      : seq(createCaseInsensitiveRegex(key), "=", field("value", value))
}

module.exports = grammar({
  name: "sql",
  extras: $ => [$.comment, /[\s\f\uFEFF\u2060\u200B]|\\\r?\n/],
  externals: $ => [
    $._dollar_quoted_string_tag,
    $._dollar_quoted_string_content,
    $._dollar_quoted_string_end_tag,
  ],
  conflicts: $ => [
    [$.declare_section],
    [$.null_constraint, $._simple_expression],
  ],
  word: $ => $._unquoted_identifier,

  rules: {
    source_file: $ => optional(seq(sep1($._statement, ";"), optional(";"))),

    _statement: $ =>
      choice(
        $.begin_statement,
        $.savepoint_statement,
        $.commit_statement,
        $.rollback_statement,
        $.pg_command,

        $.select_statement,
        $.update_statement,
        $.insert_statement,
        $.delete_statement,
        $.set_statement,
        $.grant_statement,
        $.revoke_statement,
        $.alter_default_privileges_statement,
        $.drop_statement,
        $.create_statement,
        $.alter_statement,
        $.truncate_statement,
        $.create_type_statement,
        $.create_domain_statement,
        $.create_table_statement,
        $.create_index_statement,
        $.create_schema_statement,
        $.create_database_statement,
        $.create_role_statement,
        $.create_extension_statement,
        $.create_event_trigger_statement,
        $.create_aggregate_statement,
        $.create_policy_statement,
        $.drop_function_statement,
        $.drop_database_statement,

        // TODO: remove from _statement
        $.return_statement,
        $.declare_statement,

        $.comment_statement,
        $.create_view_statement,
        $.create_materialized_view_statement,
        $.alter_type_statement,
        $.alter_table_statement,
        $.combining_query,
        $.vacuum_statement,
        $.do_statement,
        $.values_clause,

        $.create_trigger_statement,
        $.create_function_statement,
      ),

    with_clause: $ =>
      seq(kw("WITH"), optional(kw("RECURSIVE")), commaSep1($.cte)),

    cte: $ =>
      seq(
        $.identifier,
        optional(alias($.identifier_list, $.column_list)),
        kw("AS"),
        optional(seq(optional(kw("NOT")), kw("MATERIALIZED"))),
        "(",
        choice(
          $.select_statement,
          $.delete_statement,
          $.insert_statement,
          $.update_statement,
          $.combining_query,
          $.values_clause,
          $.select_subexpression,
        ),
        ")",
      ),

    select_statement: $ => seq(optional($.with_clause), $._select_statement),
    insert_statement: $ => seq(optional($.with_clause), $._insert_statement),
    update_statement: $ => seq(optional($.with_clause), $._update_statement),
    delete_statement: $ => seq(optional($.with_clause), $._delete_statement),

    truncate_statement: $ =>
      seq(
        kw("TRUNCATE"),
        optional(kw("TABLE")),
        optional(kw("ONLY")),
        commaSep1(field("table", seq($._identifier, optional("*")))),
        optional($.restart_identity),
        optional($.continue_identity),
        optional($.relationship_behavior),
      ),
    restart_identity: $ => kw("RESTART IDENTITY"),
    continue_identity: $ => kw("CONTINUE IDENTITY"),

    comment_statement: $ =>
      seq(
        kw("COMMENT ON"),
        choice(
          seq(
            choice(
              kw("ACCESS METHOD"),
              // TODO: CAST (source_type AS target_type)
              kw("COLLATION"),
              kw("COLUMN"),
              kw("CONVERSION"),
              kw("DATABASE"),
              kw("DOMAIN"),
              kw("EXTENSION"),
              kw("EVENT TRIGGER"),
              kw("FOREIGN DATA WRAPPER"),
              kw("FOREIGN TABLE"),
              kw("INDEX"),
              kw("LARGE OBJECT"),
              kw("MATERIALIZED VIEW"),
              kw("ROLE"),
              kw("SCHEMA"),
              kw("TABLE"),
              seq(optional(kw("PROCEDURAL")), kw("LANGUAGE")),
              kw("PUBLICATION"),
              kw("SEQUENCE"),
              kw("SERVER"),
              kw("STATISTICS"),
              kw("SUBSCRIPTION"),
              kw("TABLESPACE"),
              kw("TYPE"),
              kw("VIEW"),
              seq(
                kw("TEXT SEARCH"),
                choice(
                  kw("CONFIGURATION"),
                  kw("DICTIONARY"),
                  kw("PARSER"),
                  kw("TEMPLATE"),
                )
              ),
              kw("TEXT SEARCH CONFIGURATION"),
            ),
            $._identifier,
          ),
          seq(
            choice(
              kw("CONSTRAINT"),
              kw("POLICY"),
              kw("RULE"),
              kw("TRIGGER"),
            ),
            field("name", $.identifier),
            kw("ON"),
            optional(kw("DOMAIN")),
            field("target", $._identifier)
          ),
          seq(
            kw("OPERATOR"),
            choice(kw("CLASS"), kw("FAMILY")),
            field("object_name", $._identifier),
            kw("USING"),
            field("index_method", $._identifier)
          ),
          seq(
            kw("TRANSFORM FOR"),
            field("type_name", $._identifier),
            kw("LANGUAGE"),
            field("lang_name", $._identifier)
          ),
          seq(
            kw("CAST"),
            "(",
            field("src_type", $._identifier),
            kw("AS"),
            field("target_type", $._identifier),
            ")"
          ),
          seq(
            choice(
              kw("FUNCTION"),
              kw("PROCEDURE"),
              kw("ROUTINE"),
              kw("OPERATOR"),
              kw("AGGREGATE")
            ),
            $.function_call
          ),
        ),
        kw("IS"),
        choice($.string, $.NULL),
      ),

    begin_statement: $ =>
      seq(kw("BEGIN"), optional(choice(kw("WORK"), kw("TRANSACTION")))),
    savepoint_statement: $ =>
      seq(kw("SAVEPOINT"), field("savepoint_name", $.identifier)),
    commit_statement: $ =>
      seq(kw("COMMIT"), optional(choice(kw("WORK"), kw("TRANSACTION")))),
    rollback_statement: $ =>
      seq(
        kw("ROLLBACK"),
        optional(choice(
          kw("WORK"),
          kw("TRANSACTION"),
          seq(kw("TO SAVEPOINT"), field("savepoint_name", $.identifier))
        ))),

    create_statement: $ =>
      seq(
        kw("CREATE"),
        optional(choice(kw("TEMP"), kw("TEMPORARY"))),
        choice(alias($.sequence, $.create_sequence)),
      ),
    alter_statement: $ =>
      seq(
        kw("ALTER"),
        choice(
          alias($.sequence, $.alter_sequence),
          alias($.alter_schema, $.schema),
        ),
      ),

    alter_table_statement: $ =>
      choice(
        seq(
          kw("ALTER TABLE"),
          optional($.if_exists),
          optional(kw("ONLY")),
          field("table", $._identifier),
          optional("*"),
          field("actions", choice(
            commaSep1($._alter_table_action),
            $.rename_column,
            $.rename_constraint,
            $.rename_to,
            $.set_schema,
            $.attach_partition,
            $.detach_partition,
          )),
        ),
      ),
    rename_to: $ => seq(kw("RENAME TO"), $._identifier),
    owner_to: $ => seq(kw("OWNER TO"), $.role_specification),
    set_schema: $ => seq(kw("SET SCHEMA"), $._identifier),
    attach_partition: $ =>
      seq(
        kw("ATTACH PARTITION"),
        field("partition_name", $._identifier),
        choice($.partition_bound, kw("DEFAULT")),
      ),
    partition_bound: $ =>
      seq(
        kw("FOR VALUES"),
        choice(
          $.partition_bound_in,
          $.partition_bound_from_to,
          $.partition_bound_with,
        ),
      ),
    partition_bound_in: $ => seq(kw("IN"), $.expression_list),
    partition_bound_from_to: $ =>
      seq(
        kw("FROM"),
        "(",
        commaSep1(choice(kw("MINVALUE"), kw("MAXVALUE"), $._expression)),
        ")",
        kw("TO"),
        "(",
        commaSep1(choice(kw("MINVALUE"), kw("MAXVALUE"), $._expression)),
        ")",
      ),
    partition_bound_with: $ =>
      seq("WITH", "(", $.modulus, ",", $.remainder, ")"),
    modulus: $ => seq(kw("MODULUS"), field("value", $.number)),
    remainder: $ => seq(kw("REMAINDER"), field("value", $.number)),
    detach_partition: $ =>
      seq(
        kw("DETACH PARTITION"),
        field("partition_name", $._identifier),
        optional(choice(kw("CONCURRENTLY"), kw("FINALIZE"))),
      ),
    add_column: $ =>
      seq(
        kw("ADD"),
        optional(kw("COLUMN")),
        optional($.if_not_exists),
        $.table_column,
      ),
    drop_column: $ =>
      seq(
        kw("DROP"),
        optional(kw("COLUMN")),
        optional($.if_exists),
        field("column_name", $._identifier),
        optional($.relationship_behavior),
      ),
    alter_column: $ =>
      prec.right(
        seq(
          kw("ALTER"),
          optional(kw("COLUMN")),
          field("column_name", $._identifier),
          choice(
            seq(
              $.set_data_type,
              optional($.collate),
              optional($.using_expression),
            ),
            $.set_default,
            $.drop_default,
            $.set_not_null,
            $.drop_not_null,
            $.drop_expression,
            $.add_generated,
            repeat1(
              choice($.set_generated, $.set_sequence_option, $.restart_with),
            ),
            $.drop_identity,
            $.set_statistics,
            $.set_attribute_options,
            $.reset_attribute_options,
            $.set_storage,
            $.set_compression,
          ),
        ),
      ),
    set_data_type: $ =>
      seq(optional(kw("SET DATA")), kw("TYPE"), field("data_type", $._type)),
    using_expression: $ => seq(kw("USING"), $._expression),
    set_default: $ => seq(kw("SET DEFAULT"), $._column_default_expression),
    drop_default: $ => kw("DROP DEFAULT"),
    set_not_null: $ => kw("SET NOT NULL"),
    drop_not_null: $ => kw("DROP NOT NULL"),
    drop_expression: $ => seq(kw("DROP EXPRESSION"), optional($.if_exists)),
    add_generated: $ => seq(kw("ADD"), $.generated_constraint),
    set_generated: $ =>
      seq(kw("SET GENERATED"), choice(kw("ALWAYS"), kw("BY DEFAULT"))),
    set_sequence_option: $ => seq(kw("SET"), $._sequence_option),
    restart_with: $ =>
      prec.right(
        seq(
          kw("RESTART"),
          optional(seq(optional(kw("WITH")), field("restart", $.number))),
        ),
      ),
    drop_identity: $ => seq(kw("DROP IDENTITY"), optional($.if_exists)),
    set_statistics: $ => seq(kw("SET STATISTICS"), $.number),
    set_attribute_options: $ => seq(kw("SET"), $.assignment_expression_list),
    reset_attribute_options: $ =>
      seq(kw("RESET"), alias($.identifier_list, $.attribute_options)),
    set_storage: $ =>
      seq(
        kw("SET STORAGE"),
        choice(kw("PLAIN"), kw("EXTERNAL"), kw("EXTENDED"), kw("MAIN")),
      ),
    set_compression: $ => seq(kw("SET COMPRESSION"), $._identifier),

    add_table_constraint: $ =>
      prec.right(seq(kw("ADD"), $._table_constraint, optional($.not_valid))),
    not_valid: $ => kw("NOT VALID"),

    alter_constraint: $ =>
      prec.right(
        seq(
          kw("ALTER CONSTRAINT"),
          field("constraint_name", $._identifier),
          optional($.deferrable),
          optional($.initial_mode),
        ),
      ),
    deferrable: $ => seq(optional(kw("NOT")), kw("DEFERRABLE")),

    validata_constraint: $ =>
      seq(kw("VALIDATE CONSTRAINT"), field("constraint_name", $._identifier)),
    drop_constraint: $ =>
      seq(
        kw("DROP CONSTRAINT"),
        optional($.if_exists),
        field("constraint_name", $._identifier),
        optional($.relationship_behavior),
      ),
    disable_trigger: $ =>
      prec.right(
        seq(
          kw("DISABLE TRIGGER"),
          optional(
            choice(field("trigger_name", $._identifier), kw("ALL"), kw("USER")),
          ),
        ),
      ),
    enable_trigger: $ =>
      prec.right(
        seq(
          kw("ENABLE"),
          optional(choice(kw("REPLICA"), kw("ALWAYS"))),
          kw("TRIGGER"),
          optional(
            choice(field("trigger_name", $._identifier), kw("ALL"), kw("USER")),
          ),
        ),
      ),
    disable_rule: $ =>
      seq(kw("DISABLE RULE"), field("rule_name", $._identifier)),
    enable_rule: $ =>
      seq(
        kw("ENABLE"),
        optional(choice(kw("REPLICA"), kw("ALWAYS"))),
        kw("RULE"),
        field("rule_name", $._identifier),
      ),
    set_row_level_security: $ => seq(choice(
      kw("DISABLE"),
      kw("ENABLE"),
      seq(optional(kw("NO")), tok("FORCE")),
    ), kw("ROW LEVEL SECURITY")),
    cluster_on: $ => seq(kw("CLUSTER ON"), field("index_name", $._identifier)),
    set_without_cluster: $ => kw("SET WITHOUT CLUSTER"),
    set_without_oids: $ => kw("SET WITHOUT OIDS"),
    set_tablespace: $ =>
      seq(
        kw("SET TABLESPACE"),
        field("new_tablespace", $._identifier),
        optional(kw("NOWAIT")),
      ),
    set_logged: $ => kw("SET LOGGED"),
    set_unlogged: $ => kw("SET UNLOGGED"),
    set_storage_parameters: $ => seq(kw("SET"), $.assignment_expression_list),
    reset_storage_parameters: $ => seq(kw("RESET"), $.identifier_list),
    inherit: $ => seq(kw("INHERIT"), field("parent_table", $._identifier)),
    no_inherit: $ =>
      seq(kw("NO INHERIT"), field("parent_table", $._identifier)),
    of_type: $ => seq(kw("OF"), field("type", $._type)),
    not_of: $ => kw("NOT OF"),
    replica_identity: $ =>
      seq(
        kw("REPLICA IDENTITY"),
        choice(
          kw("DEFAULT"),
          seq(kw("USING INDEX"), field("index_name", $._identifier)),
          kw("FULL"),
          kw("NOTHING"),
        ),
      ),

    rename_column: $ =>
      seq(
        kw("RENAME"),
        optional(kw("COLUMN")),
        field("column_name", $._identifier),
        kw("TO"),
        field("new_column_name", $._identifier),
      ),
    rename_constraint: $ =>
      seq(
        kw("RENAME"),
        kw("CONSTRAINT"),
        field("constraint_name", $._identifier),
        kw("TO"),
        field("new_constraint_name", $._identifier),
      ),
    _alter_table_action: $ =>
      choice(
        $.add_column,
        $.drop_column,
        $.alter_column,
        $.add_table_constraint,
        $.alter_constraint,
        $.validata_constraint,
        $.drop_constraint,
        $.disable_trigger,
        $.enable_trigger,
        $.disable_rule,
        $.enable_rule,
        $.set_row_level_security,
        $.cluster_on,
        $.set_without_cluster,
        $.set_without_oids,
        $.set_tablespace,
        $.set_logged,
        $.set_unlogged,
        $.set_storage_parameters,
        $.reset_storage_parameters,
        $.inherit,
        $.no_inherit,
        $.of_type,
        $.not_of,
        $.owner_to,
        $.replica_identity,
      ),

    alter_schema: $ =>
      seq(kw("SCHEMA"), $._identifier, choice($.rename_to, $.owner_to)),

    alter_type_statement: $ =>
      seq(
        kw("ALTER TYPE"),
        $._identifier,
        choice(
          $.owner_to,
          $.rename_to,
          $.set_schema,
          $.rename_attribute,
          $.add_value,
          $.rename_value,
          $.set_properties,
          commaSep1(
            choice($.add_attribute, $.drop_attribute, $.alter_attribute),
          ),
        ),
      ),
    rename_attribute: $ =>
      seq(
        kw("RENAME ATTRIBUTE"),
        field("attribute_name", $._identifier),
        kw("TO"),
        field("new_attribute_name", $._identifier),
        optional($.relationship_behavior),
      ),
    add_value: $ =>
      seq(
        kw("ADD VALUE"),
        optional($.if_not_exists),
        field("new_enum_value", $.string),
        optional(
          seq(
            choice(kw("BEFORE"), kw("AFTER")),
            field("neighbor_enum_value", $.string),
          ),
        ),
      ),
    rename_value: $ =>
      seq(
        kw("RENAME VALUE"),
        field("existing_enum_value", $.string),
        kw("TO"),
        field("new_enum_value", $.string),
      ),
    set_properties: $ => seq(kw("SET"), $.assignment_expression_list),
    add_attribute: $ =>
      seq(
        kw("ADD ATTRIBUTE"),
        field("attribute_name", $._identifier),
        field("data_type", $._type),
        optional($.collate),
        optional($.relationship_behavior),
      ),
    drop_attribute: $ =>
      seq(
        kw("DROP ATTRIBUTE"),
        optional($.if_exists),
        field("attribute_name", $._identifier),
        optional($.relationship_behavior),
      ),
    alter_attribute: $ =>
      seq(
        kw("ALTER ATTRIBUTE"),
        field("attribute_name", $._identifier),
        $.set_data_type,
        optional($.collate),
        optional($.relationship_behavior),
      ),
    collate: $ => seq(kw("COLLATE"), field("collation", $._identifier)),
    relationship_behavior: $ => choice(kw("CASCADE"), kw("RESTRICT")),
    if_exists: $ => kw("IF EXISTS"),
    if_not_exists: $ => kw("IF NOT EXISTS"),

    sequence: $ =>
      prec.right(
        seq(
          kw("SEQUENCE"),
          optional(choice($.if_exists, $.if_not_exists)),
          $._identifier,
          optional(seq(kw("AS"), $.type)),
          repeat($._sequence_option),
        ),
      ),
    _sequence_option: $ =>
      choice(
        $.increament_by,
        choice($.minvalue, $.no_minvalue),
        choice($.maxvalue, $.no_maxvalue),
        $.start_with,
        $.cache,
        choice($.cycle, $.no_cycle),
        $.owned_by,
      ),
    increament_by: $ =>
      seq(kw("INCREMENT"), optional(kw("BY")), field("value", $.number)),
    minvalue: $ => seq(kw("MINVALUE"), field("min_value", $.number)),
    maxvalue: $ => seq(kw("MAXVALUE"), field("max_value", $.number)),
    no_minvalue: $ => kw("NO MINVALUE"),
    no_maxvalue: $ => kw("NO MAXVALUE"),
    start_with: $ =>
      seq(kw("START"), optional(kw("WITH")), field("start", $.number)),
    cache: $ => seq(kw("CACHE"), field("cache", $.number)),
    cycle: $ => kw("CYCLE"),
    no_cycle: $ => kw("NO CYCLE"),
    owned_by: $ =>
      prec.right(
        seq(kw("OWNED BY"), choice(kw("NONE"), commaSep1($._identifier))),
      ),

    pg_command: $ => seq(/\\[a-zA-Z]+/, /[^\r\n]*/),

    compound_statement: $ =>
      prec.right(seq(
        kw("BEGIN"),
        optional(kw("ATOMIC")),
        $._pl_sql_statements,
        optional(seq(
          kw("EXCEPTION"),
          field("exception_handlers", repeat($.exception_handler)),
        )),
        kw("END"),
        optional(field("end_label", $.identifier)),
      )),
    return_statement: $ =>
      seq(kw("RETURN"), field("expression", choice($._expression, $.select_statement))),
    declare_statement: $ =>
      seq(kw("DECLARE"), $.identifier, $._type, optional($.default_clause)),

    // Create function
    create_function_statement: $ =>
      seq(
        choice(createOrReplace("FUNCTION"), createOrReplace("PROCEDURE")),
        field("name", $._identifier),
        field("parameters", $.function_parameters),
        optional(seq(kw("RETURNS"), field("return_type", $._function_return_type))),
        repeat(field("hint", $._function_hint)),
        optional(seq(
          choice(kw("IS"), kw("AS")),
          optional(field("declarations", $.declare_section)),
        )),
        field("body", $.function_body),
        repeat(field("hint", $._function_hint)),
      ),
    _function_hint: $ =>
      choice(
        $._function_language,
        seq(kw("TRANSFORM FOR TYPE"), alias(commaSep1($.identifier), $.transform_hint)),
        $.window_hint,
        $.leakproof_hint,
        seq(kw("COST"), alias($.number, $.cost_hint)),
        seq(kw("ROWS"), alias($.number, $.rows_hint)),
        seq(kw("SUPPORT"), alias($.identifier, $.support_hint)),
        $.external_hint,
        $.optimizer_hint,
        $.parallel_hint,
        $.null_hint,
        $.deterministic_hint,
        $.sql_hint,
        $.sql_security_hint,
        $.dynamic_result_sets_hint,
        $.invoker_rights_hint,
      ),

    window_hint: $ => kw("WINDOW"),
    leakproof_hint: $ => seq(optional(kw("NOT")), kw("LEAKPROOF")),
    external_hint: $ => seq(optional(kw("EXTERNAL")), kw("SECURITY"), $.role_specification),
    optimizer_hint: $ => choice(kw("VOLATILE"), kw("IMMUTABLE"), kw("STABLE")),
    parallel_hint: $ => seq(kw("PARALLEL"), $._parallel_option_value),
    _parallel_option_value: $ => choice(
      kw("SAFE"),
      kw("UNSAFE"),
      kw("RESTRICTED")
    ),
    null_hint: $ =>
      choice(
        kw("CALLED ON NULL INPUT"),
        kw("RETURNS NULL ON NULL INPUT"),
        kw("STRICT"),
      ),

    // MySQL hints
    deterministic_hint: $ => seq(optional(kw("NOT")), kw("DETERMINISTIC")),
    sql_hint: $ =>
      choice(
        kw("CONTAINS SQL"),
        kw("NO SQL"),
        kw("READS SQL DATA"),
        kw("MODIFIES SQL DATA"),
      ),
    sql_security_hint: $ =>
      seq(kw("SQL SECURITY"), $.role_specification),

    // Teradata hints
    dynamic_result_sets_hint: $ => seq(kw("DYNAMIC RESULT SETS"), field("num_result_sets", $.number)),

    // Oracle hints
    invoker_rights_hint: $ => seq(kw("AUTHID"), $.role_specification),

    _function_language: $ =>
      seq(
        kw("LANGUAGE"),
        alias(choice($.identifier, $.string), $.language),
      ),
    _function_return_type: $ =>
      prec.right(choice($.setof, $._type, $.constrained_type)),
    setof: $ =>
      prec.right(seq(kw("SETOF"), choice($._type, $.constrained_type))),
    constrained_type: $ => seq($._type, $.null_constraint),
    function_parameters: $ =>
      seq("(", optional(commaSep1($.function_parameter)), ")"),
    function_parameter: $ =>
      seq(
        choice(
          seq(
            field("argmode", optional($.function_argmode)),
            field("name", optional($.identifier)),
          ),
          seq(
            field("name", optional($.identifier)),
            field("argmode", optional($.function_argmode)),
          ),
        ),
        field("type", choice($._type, $.constrained_type)),
        optional(seq(
          choice("=", kw("DEFAULT")),
          field("default_value", $._expression)
        )),
      ),
    function_argmode: $ => choice(
      kw("IN"),
      seq(optional(kw("IN")), kw("OUT"), optional(kw("NOCOPY"))),
      kw("INOUT"),
      kw("VARIADIC")
    ),

    function_body: $ => seq(
      choice(
        seq($.string, optional(seq(",", $.string))),
        seq(optional($.label), $.compound_statement),
        $.select_statement,
        $.return_statement,
      ),
    ),

    create_trigger_statement: $ =>
      seq(
        kw("CREATE"),
        optional(kw("OR REPLACE")),
        optional(kw("CONSTRAINT")),
        kw("TRIGGER"),
        optional($.if_not_exists),
        field("name", $.identifier),
        $.trigger_time,
        $.trigger_event,
        kw("ON"),
        field("on_table", $._identifier),
        optional($.trigger_reference),
        optional($.trigger_preferencing),
        optional(
          seq(
            kw("FOR"),
            optional(kw("EACH")),
            choice(kw("ROW"), kw("STATEMENT")),
          ),
        ),
        optional($.trigger_condition),
        optional($.trigger_order),
        $.trigger_body,
      ),
    trigger_reference: $ => seq(kw("FROM"), $._identifier),
    trigger_preferencing: $ =>
      seq(
        kw("REFERENCING"),
        repeat1(
          seq(
            choice(kw("NEW"), kw("OLD")),
            kw("TABLE"),
            optional(kw("AS")),
            $.identifier,
          ),
        ),
      ),
    trigger_time: $ => choice(kw("BEFORE"), kw("AFTER"), kw("INSTEAD OF")),
    trigger_event: $ =>
      choice(
        kw("INSERT"),
        kw("DELETE"),
        kw("TRUNCATE"),
        seq(kw("UPDATE"), optional(seq(kw("OF"), repeat1($._identifier)))),
      ),
    // PostgreSQL trigger condition
    trigger_condition: $ => seq(kw("WHEN"), $._expression),
    // MySQL trigger order
    trigger_order: $ =>
      seq(choice(kw("FOLLOWS"), kw("PRECEDES")), $._identifier),
    trigger_body: $ =>
      choice(
        $.execute_clause,
        // PostgreSQL style trigger body
        // MySQL style trigger body
        $._statement,
        $.compound_statement,
      ),
    execute_clause: $ =>
      seq(
        kw("EXECUTE"),
        choice(kw("FUNCTION"), kw("PROCEDURE")),
        seq(
          field("function", $._identifier),
          "(",
          optional(field("arguments", commaSep1($.string))),
          ")",
        ),
      ),

    create_event_trigger_statement: $ =>
      seq(
        kw("CREATE EVENT TRIGGER"),
        field("name", $.identifier),
        kw("ON"),
        field("event", $.identifier),
        optional($.trigger_condition),
        $.execute_clause,
      ),

    create_extension_statement: $ =>
      prec.right(
        seq(
          kw("CREATE EXTENSION"),
          optional($.if_not_exists),
          $._identifier,
          optional(kw("WITH")),
          repeat(
            choice(
              seq(kw("SCHEMA"), alias($._identifier, $.schema)),
              seq(kw("VERSION"), alias($.string, $.version)),
              kw("CASCADE"),
            ),
          ),
        ),
      ),
    create_role_statement: $ =>
      prec.right(
        seq(
          kw("CREATE ROLE"),
          $._identifier,
          optional(kw("WITH")),
          optional($._identifier),
        ),
      ),
    create_schema_statement: $ =>
      seq(kw("CREATE SCHEMA"), optional($.if_not_exists), $._identifier),
    create_database_statement: $ => seq(
      kw("CREATE DATABASE"),
      optional($.if_not_exists),
      field('name', $._identifier),
      optional(seq(
        optional(choice(kw('WITH'), kw('DEFAULT'))),
        field('options', repeat($.kv_option))
      ))
    ),
    drop_database_statement: $ => seq(
      kw("DROP DATABASE"),
      optional($.if_exists),
      field('name', $._identifier),
      optional(seq(
        optional(kw('WITH')),
        field('options', commaSep1($.kv_option))
      ))
    ),

    drop_statement: $ =>
      seq(
        kw("DROP"),
        field(
          "kind",
          choice(
            kw("TABLE"),
            kw("VIEW"),
            kw("INDEX"),
            kw("TYPE"),
            kw("TRIGGER"),
            kw("SEQUENCE"),
            kw("EXTENSION"),
            kw("TABLESPACE"),
            kw("MATERIALIZED VIEW"),
          ),
        ),
        optional(kw("CONCURRENTLY")),
        optional($.if_exists),
        field("target", commaSep1($._identifier)),
        optional(seq(kw("ON"), field("target_table", $._identifier))),
        optional($.relationship_behavior),
      ),

    drop_function_statement: $ =>
      prec.right(seq(
        kw("DROP FUNCTION"),
        optional($.if_exists),
        field("target", commaSep1(seq(
          $._identifier,
          optional($.function_parameters)
        ))),
        optional($.relationship_behavior),
      )),

    vacuum_statement: $ =>
      prec.right(
        seq(
          kw("VACUUM"),
          choice(
            seq("(", commaSep1($.vacuum_option), ")"),
            seq(
              optional(kw("FULL")),
              optional(kw("FREEZE")),
              optional(kw("VERBOSE")),
              optional(kw("ANALYZE")),
            ),
          ),
          commaSep($._table_and_columns),
        ),
      ),
    _table_and_columns: $ =>
      prec.right(choice($._identifier, $.table_and_columns)),
    _boolean_value: $ => choice($.TRUE, $.FALSE),
    vacuum_option: $ =>
      choice(
        seq(kw("FULL"), optional($._boolean_value)),
        seq(kw("FREEZE"), optional($._boolean_value)),
        seq(kw("VERBOSE"), optional($._boolean_value)),
        seq(kw("ANALYZE"), optional($._boolean_value)),
        seq(kw("DISABLE_PAGE_SKIPPING"), optional($._boolean_value)),
        seq(kw("SKIP_LOCKED"), optional($._boolean_value)),
        seq(kw("INDEX_CLEANUP"), choice(kw("AUTO"), kw("ON"), kw("OFF"))),
        seq(kw("PROCESS_TOAST"), optional($._boolean_value)),
        seq(kw("TRUNCATE"), optional($._boolean_value)),
        seq(kw("PARALLEL"), $.number),
      ),

    do_statement: $ => seq(kw("DO"), optional($._function_language), $.string),

    set_statement: $ =>
      seq(
        kw("SET"),
        field("scope", optional(choice(kw("SESSION"), kw("LOCAL")))),
        choice(
          seq(kw("ROLE"), field("role_name", $._identifier)),
          seq(
            kw("TIME ZONE"),
            field("timezone", choice(
              $.string,
              kw("LOCAL"),
              kw("DEFAULT")
            ))
          ),
          seq(
            $._identifier,
            choice("=", kw("TO")),
            choice($._expression, kw("DEFAULT")),
          )
        )
      ),
    grant_statement: $ =>
      prec.right(
        seq(
          kw("GRANT"),
          $.privileges,
          kw("ON"),
          $.privilege_objects,
          kw("TO"),
          commaSep1($.role_specification),
          optional(kw("WITH GRANT OPTION")),
          optional(seq(kw("GRANTED BY"), $.role_specification))
        ),
      ),
    revoke_statement: $ =>
      prec.right(
        seq(
          kw("REVOKE"),
          optional(kw("GRANT OPTION FOR")),
          $.privileges,
          kw("ON"),
          $.privilege_objects,
          kw("FROM"),
          commaSep1($.role_specification),
          optional(seq(kw("GRANTED BY"), $.role_specification)),
          optional($.relationship_behavior),
        ),
      ),
    privileges: $ =>
      choice(
        seq(kw("ALL"), optional(kw("PRIVILEGES"))),
        repeat1(seq(
          choice(
            kw("SELECT"),
            kw("INSERT"),
            kw("UPDATE"),
            kw("DELETE"),
            kw("TRUNCATE"),
            kw("REFERENCES"),
            kw("TRIGGER"),
            kw("USAGE"),
            kw("EXECUTE"),
            kw("CREATE"),
          ),
          optional(alias($.identifier_list, $.column_names))
        )),
      ),
    privilege_objects: $ => choice(
      $._obj_types,
      seq(
        kw("ALL"),
        $._obj_types,
        seq(
          kw("IN SCHEMA"),
          field("schema_names", commaSep1($._identifier))
        ),
      ),
      seq(
        field("type", optional(
          choice(
            kw("SCHEMA"),
            kw("DATABASE"),
            kw("SEQUENCE"),
            kw("TABLE"),
            kw("TYPE"),
            kw("DOMAIN"),
            kw("LANGUAGE"),
            kw("TABLESPACE"),
            kw("FUNCTION"),
            kw("PROCEDURE"),
            kw("ROUTINE"),
          ),
        )),
        commaSep1($._identifier),
      ),
    ),
    _obj_types: $ =>
      choice(
        kw("SCHEMAS"),
        kw("DATABASES"),
        kw("SEQUENCES"),
        kw("TABLES"),
        kw("FUNCTIONS"),
        kw("ROUTINES"),
        kw("TYPES"),
      ),
    role_specification: $ =>
      choice(
        seq(optional(kw("GROUP")), $._identifier),
        kw("PUBLIC"),
        kw("CURRENT_ROLE"),
        kw("CURRENT_USER"),
        kw("SESSION_USER"),
        kw("DEFINER"),
        kw("INVOKER"),
      ),

    alter_default_privileges_statement: $ => seq(
      kw("ALTER DEFAULT PRIVILEGES"),
      optional(seq(
        kw("FOR"),
        choice(kw("USER"), kw("ROLE")),
        commaSep1(field("target_role", $.identifier))
      )),
      optional(seq(
        kw("IN SCHEMA"),
        commaSep1(field("schema_name", $.identifier))
      )),
      choice(
        alias($.grant_statement, $.grant),
        alias($.revoke_statement, $.revoke),
      )
    ),

    create_domain_statement: $ =>
      prec.right(
        seq(
          kw("CREATE DOMAIN"),
          $._identifier,
          optional(
            seq(
              kw("AS"),
              $._type,
              repeat(choice($.null_constraint, $.check_constraint)),
            ),
          ),
        ),
      ),

    create_type_statement: $ =>
      prec.right(
        seq(
          kw("CREATE TYPE"),
          $._identifier,
          optional(
            choice(
              $.type_spec_composite,
              $.type_spec_enum,
              $.type_spec_range,
              $.type_spec_base,
            ),
          ),
        ),
      ),
    type_spec_composite: $ =>
      seq(
        kw("AS"),
        "(",
        commaSep1(seq($.identifier, choice($._type, $.constrained_type))),
        ")",
      ),
    type_spec_enum: $ =>
      seq(kw("AS"), kw("ENUM"), "(", commaSep($.string), ")"),
    type_spec_range: $ =>
      seq(
        kw("AS"),
        kw("RANGE"),
        "(",
        commaSep(
          choice(
            ...[
              "SUBTYPE",
              "SUBTYPE_OPCLASS",
              "COLLATION",
              "CANONICAL",
              "SUBTYPE_DIFF",
              "MULTIRANGE_TYPE_NAME",
            ].map(k => kv(k, $._identifier)),
          ),
        ),
        ")",
      ),
    type_spec_base: $ =>
      seq(
        "(",
        commaSep(
          choice(
            ...[
              ["INPUT", $._identifier],
              ["OUTPUT", $._identifier],
              ["RECEIVE", $._identifier],
              ["SEND", $._identifier],
              ["TYPMOD_IN", $._identifier],
              ["TYPMOD_OUT", $._identifier],
              ["ANALYZE", $._identifier],
              ["SUBSCRIPT", $._identifier],
              ["INTERNALLENGTH", choice($.number, kw("VARIABLE"))],
              ["PASSEDBYVALUE", null],
              ["ALIGNMENT", $._identifier],
              ["STORAGE", $._identifier],
              ["LIKE", $._identifier],
              ["CATEGORY", $.string],
              ["PREFERRED", $.string],
              ["DEFAULT", $._expression],
              ["ELEMENT", $._identifier],
              ["DELIMITER", $.string],
              ["COLLATABLE", $._identifier],
            ].map(([k, v]) => kv(k, v)),
          ),
        ),
        ")",
      ),

    create_aggregate_statement: $ =>
      seq(
        createOrReplace("AGGREGATE"),
        field("name", $._identifier),
        field("parameters", $.function_parameters),
        "(",
        commaSep(
          choice(
            ...[
              ["SFUNC", $._identifier],
              ["STYPE", $._type],
              ["SSPACE", $.number],
              ["FINALFUNC", $._identifier],
              ["FINALFUNC_EXTRA", null],
              ["FINALFUNC_MODIFY", $._modify_option_value],
              ["COMBINEFUNC", $._identifier],
              ["SERIALFUNC", $._identifier],
              ["DESERIALFUNC", $._identifier],
              ["INITCOND", $.string],
              ["MSFUNC", $._identifier],
              ["MINVFUNC", $._identifier],
              ["MSTYPE", $._type],
              ["MSSPACE", $.number],
              ["MFINALFUNC", $._identifier],
              ["MFINALFUNC_EXTRA", null],
              ["MFINALFUNC_MODIFY", $._modify_option_value],
              ["MINITCOND", $.string],
              ["SORTOP", $._identifier],
              ["PARALLEL", $._parallel_option_value],
            ].map(([k, v]) => kv(k, v)),
          ),
        ),
        ")",
      ),
    _modify_option_value: $ => choice(
      kw("READ_ONLY"),
      kw("SHAREABLE"),
      kw("READ_WRITE")
    ),

    create_policy_statement: $ => prec.right(seq(
      kw("CREATE POLICY"),
      field("name", $.identifier),
      kw("ON"),
      field("table_name", $._identifier),
      optional(seq(kw("AS"), choice(
        kw("PERMISSIVE"),
        kw("RESTRICTIVE")
      ))),
      optional(seq(kw("FOR"), choice(
        kw("ALL"),
        kw("SELECT"),
        kw("INSERT"),
        kw("UPDATE"),
        kw("DELETE")
      ))),
      optional(seq(kw("TO"), commaSep1($.role_specification))),
      optional(seq(kw("USING"), $._parenthesized_expression)),
      optional(seq(kw("WITH CHECK"), $._parenthesized_expression)),
    )),

    create_index_statement: $ =>
      prec.right(
        seq(
          kw("CREATE"),
          optional($.unique_constraint),
          kw("INDEX"),
          optional($.concurrently),
          optional(seq(optional($.if_not_exists), field("name", $.identifier))),
          kw("ON"),
          optional(kw("ONLY")),
          field("table", $._identifier),
          optional($.using_clause),
          field("items", $._index_items),
          optional($.index_include_clause),
          optional($.index_with_clause),
          optional($.tablespace_hint),
          optional($.where_clause),
        ),
      ),
    concurrently: $ => kw("CONCURRENTLY"),
    _index_items: $ => seq("(", commaSep1($.index_item), ")"),
    index_item: $ =>
      seq(
        choice($._identifier, $.function_call, $._parenthesized_expression),
        optional($.collate),
        optional($.op_class),
        optional($.order),
        optional($.nulls_order),
      ),
    order: $ => choice(kw("ASC"), kw("DESC")),
    nulls_order: $ => seq(kw("NULLS"), choice(kw("FIRST"), kw("LAST"))),
    index_include_clause: $ => seq(kw("INCLUDE"), $.identifier_list),
    index_with_clause: $ =>
      seq(kw("WITH"), alias($.option_list, $.storage_parameters)),

    // CREATE TABLE
    create_table_statement: $ =>
      seq(
        kw("CREATE"),
        optional(choice(kw("TEMPORARY"), kw("TEMP"))),
        kw("TABLE"),
        optional($.if_not_exists),
        field("name", $._identifier),
        choice(
          seq(
            optional(alias($.identifier_list, $.column_names)),
            optional($.comment_clause),
            kw("AS"),
            choice(
              $.select_statement,
              $.values_clause,
            )
          ),
          seq(
            $._table_parameters,
            optional($.comment_clause),
            optional(
              seq(
                optional(kw("AS")),
                $.select_statement
              )
            )
          )
        ),
        optional(kw("WITHOUT OIDS")),
      ),
    _table_parameters: $ =>
      seq(
        "(",
        commaSep(choice(
          field("columns", $.table_column),
          field("constraints", $._table_constraint)
        )),
        ")",
      ),
    table_column: $ =>
      prec.right(
        seq(
          field("name", $._identifier),
          field("type", $._type),
          field("constraints", repeat($._column_constraint)),
        ),
      ),

    _column_constraint: $ => choice(
      $.default_clause,
      $.primary_key_constraint,
      $.check_constraint,
      $.references_constraint,
      $.unique_constraint,
      $.null_constraint,
      $.named_constraint,
      $.auto_increment_constraint,
      $.generated_constraint,
      $.order,
      $.comment_clause
    ),
    unique_constraint: $ => kw("UNIQUE"),
    null_constraint: $ => seq(optional(kw("NOT")), $.NULL),
    check_constraint: $ => seq(kw("CHECK"), $._expression),
    named_constraint: $ => seq("CONSTRAINT", $.identifier),
    auto_increment_constraint: _ => kw("AUTO_INCREMENT"),
    generated_constraint: $ => prec.right(seq(
      kw("GENERATED"),
      choice(kw("ALWAYS"), kw("BY DEFAULT")),
      kw("AS"),
      choice(
        seq($._parenthesized_expression, kw("STORED")),
        seq(kw("IDENTITY"), optional(seq(
          "(", repeat1($._sequence_option), ")"
        )))
      ),
    )),
    // TODO: named constraints
    references_constraint: $ =>
      prec.right(
        seq(
          kw("REFERENCES"),
          $._identifier,
          optional($.identifier_list),
          // seems like a case for https://github.com/tree-sitter/tree-sitter/issues/130
          repeat(choice($.on_update_action, $.on_delete_action)),
        ),
      ),
    on_update_action: $ =>
      seq(kw("ON UPDATE"), $._constraint_action),
    on_delete_action: $ =>
      seq(kw("ON DELETE"), $._constraint_action),
    _constraint_action: $ =>
      choice($.relationship_behavior, kw("SET NULL")),

    _column_default_expression: $ =>
      choice(
        $.function_call,
        $._parenthesized_expression,
        $.string,
        $.number,
        $.identifier,
        $.type_cast,
        $.field_selection,
        $.TRUE,
        $.FALSE,
        $.NULL,
      ),
    default_clause: $ =>
      seq(
        kw("DEFAULT"),
        // TODO: this should be specific variable-free expression https://www.postgresql.org/docs/9.1/sql-createtable.html
        // TODO: simple expression to use for check and default
        $._column_default_expression,
      ),

    comment_clause: $ => seq(kw("COMMENT"), optional("="), $.string),

    _table_constraint: $ =>
      prec.right(
        seq(
          optional(seq(kw("CONSTRAINT"), field("name", $._identifier))),
          choice(
            alias($.table_constraint_foreign_key, $.foreign_key),
            alias($.table_constraint_unique, $.unique),
            alias($.table_constraint_primary_key, $.primary_key),
            alias($.table_constraint_check, $.check),
            alias($.table_constraint_exclude, $.exclude),
          ),
          optional(alias($.deferrable, $.mode)),
          optional($.initial_mode),
        ),
      ),
    table_constraint_check: $ => seq(kw("CHECK"), $._expression),
    op_class: $ => seq($._identifier, optional($.assignment_expression_list)),
    assignment_expression_list: $ =>
      seq("(", commaSep1($.assignment_expression), ")"),
    exclude_entry: $ =>
      seq(
        $._identifier,
        optional($.op_class),
        optional(seq(kw("WITH"), $.binary_operator)),
      ),
    table_constraint_exclude: $ =>
      seq(
        kw("EXCLUDE"),
        optional(seq(kw("USING"), $._identifier)),
        "(",
        commaSep1($.exclude_entry),
        ")",
      ),
    table_constraint_foreign_key: $ =>
      seq(
        tok("FOREIGN KEY"),
        alias($.identifier_list, $.column_names),
        $.references_constraint,
      ),
    table_constraint_unique: $ =>
      seq(kw("UNIQUE"), alias($.identifier_list, $.column_names)),
    table_constraint_primary_key: $ =>
      seq($.primary_key_constraint, alias($.identifier_list, $.column_names)),
    primary_key_constraint: $ => kw("PRIMARY KEY"),
    mode: $ => choice(kw("NOT DEFERRABLE"), kw("DEFERRABLE")),
    initial_mode: $ => seq(kw("INITIALLY"), choice(kw("DEFERRED"), kw("IMMEDIATE"))),

    create_view_statement: $ =>
      prec.right(
        seq(
          kw("CREATE"),
          optional(createCaseInsensitiveRegex("OR REPLACE")),
          optional(choice(kw("TEMPORARY"), kw("TEMP"))),
          kw("VIEW"),
          optional($.if_not_exists),
          field("name", $._identifier),
          optional(field("columns", $.view_columns)),
          optional($.comment_clause),
          optional($.view_options),
          $.view_body,
          optional($.view_check_option),
        ),
      ),
    // Support column comments
    view_columns: $ => seq("(", commaSep1($.view_column), ")"),
    view_column: $ => seq($._identifier, optional($.comment_clause)),
    // PostgreSQL currently only support the SECURITY_BARRIER option
    kv_option: $ => prec.right(seq(field('key', $._identifier), optional(seq(optional('='), field('value', $._simple_expression))))),
    option_list: $ =>
      seq("(", commaSep1($.kv_option), ")"),
    view_options: $ => seq(kw("WITH"), $.option_list),
    // MySQL support
    view_check_option: $ =>
      seq(
        kw("WITH"),
        optional(choice(kw("CASCADED"), kw("LOCAL"))),
        kw("CHECK OPTION"),
      ),
    view_body: $ =>
      seq(
        kw("AS"),
        choice(
          $.select_statement,
          $.select_subexpression,
          $.combining_query,
          $.values_clause
        ),
      ),

    create_materialized_view_statement: $ =>
      prec.right(
        seq(
          kw("CREATE MATERIALIZED VIEW"),
          optional($.if_not_exists),
          field("name", $._identifier),
          optional(field("columns", alias($.identifier_list, $.column_names))),
          optional($.using_clause),
          optional($.view_options),
          optional($.tablespace_hint),
          $.view_body,
          optional($.data_hint),
        ),
      ),
    tablespace_hint: $ => seq(kw("TABLESPACE"), $._identifier),
    data_hint: $ => seq(kw("WITH"), optional(kw("NO")), kw("DATA")),
    using_clause: $ => seq(kw("USING"), choice($.identifier, $.identifier_list)),


    // SELECT
    _select_statement: $ =>
      prec.right(
        seq(
          $.select_clause,
          optional($.from_clause),
          optional($.where_clause),
          optional($.group_by_clause),
          optional($.window_clause),
          optional($.order_by_clause),
          optional($.limit_clause),
          optional($.offset_clause),
        ),
      ),

    group_by_clause: $ =>
      seq(
        kw("GROUP BY"),
        commaSep1($.grouping_expression),
        optional($.having_clause),
      ),
    having_clause: $ => seq(kw("HAVING"), $._expression),
    grouping_expression: $ =>
      prec(
        1,
        choice(
          $._simple_expression,
          $.grouping_sets_clause,
          $.rollup_clause,
          $.cube_clause,
        ),
      ),
    grouping_sets_clause: $ =>
      seq(kw("GROUPING SETS"), "(", commaSep1($.grouping_set), ")"),
    rollup_clause: $ =>
      seq(
        kw("ROLLUP"),
        "(",
        commaSep1(choice($._simple_expression, $.grouping_set)),
        ")",
      ),
    cube_clause: $ =>
      seq(
        kw("CUBE"),
        "(",
        commaSep1(choice($._simple_expression, $.grouping_set)),
        ")",
      ),
    grouping_set: $ => prec(1, seq("(", commaSep($._simple_expression), ")")),
    expression_list: $ => seq("(", commaSep($._expression), ")"),
    order_expression: $ =>
      seq($._expression, optional($.order), optional($.nulls_order)),
    window_clause: $ =>
      seq(kw("WINDOW"), field("items", commaSep1($.window_item))),
    window_item: $ => seq($.identifier, kw("AS"), $.window_definition),
    order_by_clause: $ => seq(kw("ORDER BY"), commaSep1($.order_expression)),
    limit_clause: $ =>
      seq(
        kw("LIMIT"),
        choice($.number, kw("ALL")),
        optional(seq(",", $.number)), // MySQL LIMIT a, b
      ),
    offset_clause: $ =>
      prec.right(
        seq(kw("OFFSET"), $.number, optional(choice(kw("ROW"), kw("ROWS")))),
      ),
    fetch_clause: $ =>
      seq(
        kw("FETCH"),
        choice(kw("FIRST"), kw("NEXT")),
        optional($.number),
        choice(kw("ROW"), kw("ROWS")),
        kw("ONLY"),
      ),
    where_clause: $ => seq(kw("WHERE"), field("condition", $._expression)),
    alias: $ =>
      prec.right(
        choice($.identifier, $.table_and_columns, $.column_definitions),
      ),
    aliased_expression: $ => seq(field("expression", $._expression), optional(kw("AS")), field("alias", $.alias)),
    identifier_list: $ => seq("(", commaSep1($._identifier), ")"),
    table_and_columns: $ =>
      seq(
        $._identifier,
        choice(alias($.identifier_list, $.column_names), $.column_definitions),
      ),
    column_definitions: $ => seq("(", commaSep1($.table_column), ")"),
    _aliasable_expression: $ =>
      prec.right(choice($._expression, $.aliased_expression)),
    distinct_clause: $ =>
      prec.right(
        seq(kw("DISTINCT"), optional(seq(kw("ON"), $.expression_list))),
      ),
    select_item: $ =>
      seq(
        $._aliasable_expression,
        optional(seq(kw("INTO"), field("into", $.identifier))),
      ),
    select_clause: $ =>
      prec.right(
        seq(
          kw("SELECT"),
          optional(choice(kw("ALL"), $.distinct_clause)),
          field("items", commaSep($.select_item)),
        ),
      ),
    from_clause: $ => seq(kw("FROM"), field("items", commaSep1($.from_item))),
    from_item: $ =>
      choice(
        seq(
          optional(kw("ONLY")),
          $._aliasable_expression,
          optional($.tablesample_clause),
        ),
        seq("(", $.join_clause, ")"),
        $.join_clause,
      ),
    tablesample_clause: $ =>
      seq(kw("TABLESAMPLE"), $.function_call, optional($.repeatable_clause)),
    repeatable_clause: $ =>
      seq(kw("REPEATABLE"), "(", field("seed", $._expression), ")"),
    rows_from_expression: $ =>
      prec.right(
        seq(
          optional(kw("LATERAL")),
          kw("ROWS FROM"),
          "(",
          commaSep1(seq($.function_call, optional(seq(kw("AS"), $.alias)))),
          ")",
          optional($.with_ordinality),
        ),
      ),

    join_clause: $ =>
      prec.right(seq(
        $.from_item,
        optional(kw("NATURAL")),
        optional($.join_type),
        kw("JOIN"),
        $.from_item,
        optional(choice($.join_condition, $.using_clause)),
      )),
    join_type: $ =>
      choice(
        kw("INNER"),
        kw("CROSS"),
        seq(
          choice(kw("LEFT"), kw("RIGHT"), kw("FULL")),
          optional(kw("OUTER")),
        ),
      ),
    join_condition: $ => seq(kw("ON"), $._expression),

    _combinable_query: $ =>
      prec.right(
        choice(
          $.select_statement,
          $.select_subexpression,
          $._aliased_subquery,
          $.values_clause,
          $.combining_query,
        ),
      ),
    _aliased_subquery: $ =>
      prec(1, seq($.select_subexpression, optional(kw("AS")), $.alias)),
    combining_query: $ =>
      choice(
        ...[
          [choice(kw("UNION"), kw("EXCEPT")), PREC.additive],
          [kw("INTERSECT"), PREC.multiplicative],
        ].map(([combinator, precedence]) =>
          prec.left(
            precedence,
            seq(
              field("left", $._combinable_query),
              combinator,
              optional(kw("ALL")),
              field("right", $._combinable_query),
            ),
          ),
        ),
      ),
    select_subexpression: $ =>
      prec(
        1,
        seq(
          optional(kw("LATERAL")),
          "(",
          choice($.select_statement, $.combining_query, $.values_clause),
          ")",
        ),
      ),

    // UPDATE
    _update_statement: $ =>
      seq(
        kw("UPDATE"),
        optional(kw("ONLY")),
        field("table", $.identifier),
        optional("*"),
        optional(seq(optional(kw("AS")), field("table_alias", $.alias))),
        $.set_clause,
        optional($.from_clause),
        optional($.where_clause),
        optional($._returning_clause),
      ),
    set_clause: $ => seq(kw("SET"), commaSep1($.assignment_expression)),
    assignment_expression: $ =>
      choice(
        seq(field("left", $._identifier), "=", field("right", $._expression)),
        seq(
          field("left", $.identifier_list),
          "=",
          field("right", choice(
            $.select_subexpression,
            $.row_constructor,
            $.composite_expression,
          )),
        ),
      ),

    // INSERT
    _insert_statement: $ =>
      seq(
        kw("INSERT"),
        kw("INTO"),
        field("table", $._identifier),
        optional(seq(kw("AS"), field("table_alias", $.identifier))),
        optional(field("columns", alias($.identifier_list, $.column_names))),
        optional($.overriding_value),
        choice(
          $.default_values,
          $.values_clause,
          $.select_statement,
          $.set_clause,
        ),
        optional($.on_conflict),
        optional($._returning_clause),
      ),
    overriding_value: $ =>
      seq(kw("OVERRIDING"), choice(kw("SYSTEM"), kw("USER")), kw("VALUE")),
    default_values: $ => kw("DEFAULT VALUES"),
    on_conflict: $ =>
      seq(kw("ON CONFLICT"), optional(field("target", $.conflict_target)), field("action", $.conflict_action)),
    conflict_target: $ =>
      choice(seq($.index_item, optional($.where_clause)), $.on_constraint),
    on_constraint: $ =>
      seq(kw("ON CONSTRAINT"), field("constraint_name", $._identifier)),
    conflict_action: $ => choice($.do_nothing, $.do_update),
    do_nothing: $ => kw("DO NOTHING"),
    do_update: $ =>
      seq(kw("DO UPDATE"), $.set_clause, optional($.where_clause)),
    returning_clause: $ => seq(kw("RETURNING"), field("value", $._aliasable_expression)),
    values_clause: $ =>
      seq(
        kw("VALUES"),
        field("items", commaSep1($.values_item)),
        optional($.order_by_clause),
        optional($.limit_clause),
        optional($.offset_clause),
        optional($.fetch_clause),
      ),
    values_item: $ => choice(
      seq("(", commaSep1(choice($._expression, kw("DEFAULT"))), ")"),
      $.row_constructor,
    ),

    // DELETE
    _delete_statement: $ =>
      prec.right(seq(
        kw("DELETE FROM"),
        optional(kw("ONLY")),
        field("table", $._identifier),
        optional("*"),
        optional(seq(optional(kw("AS")), field("table_alias", $.alias))),
        optional($.where_clause),
        optional($._returning_clause),
      )),

    conditional_expression: $ =>
      seq(
        kw("CASE"),
        optional(field("subject", $._expression)),
        repeat1($.conditional_case),
        optional(seq(kw("ELSE"), field("default_value", $._expression))),
        kw("END"),
      ),
    conditional_case: $ => seq(kw("WHEN"), field("condition", $._expression), kw("THEN"), field("value", $._expression)),

    in_expression: $ =>
      prec.left(
        PREC.comparative,
        seq(
          field("left", $._expression),
          optional(kw("NOT")),
          kw("IN"),
          field("right", choice($.select_subexpression, $.tuple)),
        ),
      ),
    tuple: $ =>
      seq(
        // TODO: maybe collapse with function arguments, but make sure to preserve clarity
        "(",
        field("elements", commaSep1($._expression)),
        ")",
      ),

    function_call: $ =>
      prec.right(
        1,
        seq(
          optional(kw("LATERAL")),
          field("function", $._identifier),
          "(",
          optional(field("arguments", $._function_call_arguments)),
          ")",
          optional($.with_ordinality),
          optional($.within_group_clause),
          optional($.filter_clause),
          optional($.over_clause),
        ),
      ),
    _function_call_arguments: $ =>
      seq(
        optional(choice(kw("ALL"), kw("DISTINCT"))),
        choice(
          commaSep1(choice($._expression, $.named_argument)),
          $.select_statement
        ),
        optional(seq(kw("FROM"), $._expression)),
        optional(seq(kw("FOR"), $.number)),
        optional(seq(kw("AS"), $._type)),
        optional($.order_by_clause),
      ),
    named_argument: $ => seq(
      field("name", $.identifier),
      choice(":=", "=>"),
      field("value", $._expression)
    ),
    within_group_clause: $ =>
      seq(kw("WITHIN GROUP"), "(", $.order_by_clause, ")"),
    filter_clause: $ => seq(kw("FILTER"), "(", $.where_clause, ")"),
    over_clause: $ =>
      seq(kw("OVER"), choice($.identifier, $.window_definition)),
    window_definition: $ =>
      seq(
        "(",
        optional($.partition_by_clause),
        optional($.order_by_clause),
        optional($.frame_clause),
        ")",
      ),
    partition_by_clause: $ => seq(kw("PARTITION BY"), commaSep1($._expression)),
    frame_clause: $ =>
      choice(
        seq(
          $.frame_kind,
          field("frame_start", $.frame_bound),
          optional($.frame_exclusion),
        ),
        seq(
          $.frame_kind,
          kw("BETWEEN"),
          field("frame_start", $.frame_bound),
          kw("AND"),
          field("frame_end", $.frame_bound),
          optional($.frame_exclusion),
        ),
      ),
    frame_kind: $ => choice(kw("RANGE"), kw("ROWS"), kw("GROUPS")),
    frame_bound: $ =>
      choice(
        kw("UNBOUNDED PRECEDING"),
        seq($._expression, kw("PRECEDING")),
        kw("CURRENT ROW"),
        seq($._expression, kw("FOLLOWING")),
        kw("UNBOUNDED FOLLOWING"),
      ),
    frame_exclusion: $ =>
      choice(
        kw("EXCLUDE CURRENT ROW"),
        kw("EXCLUDE GROUP"),
        kw("EXCLUDE TIES"),
        kw("EXCLUDE NO OTHERS"),
      ),

    _parenthesized_expression: $ =>
      prec.left(PREC.unary, seq("(", $._expression, ")")),
    with_ordinality: $ => kw("WITH ORDINALITY"),

    is_expression: $ =>
      prec.left(
        PREC.comparative,
        seq(
          field("left", $._expression),
          kw("IS"),
          optional(kw("NOT")),
          field("right", choice($.NULL, $.TRUE, $.FALSE, $.UNKNOWN, $.distinct_from)),
        ),
      ),
    distinct_from: $ => prec.left(seq(kw("DISTINCT FROM"), $._expression)),
    isnull_expression: $ => seq(field("expression", $._expression), kw("ISNULL")),
    notnull_expression: $ => seq(field("expression", $._expression), kw("NOTNULL")),
    between_and_expression: $ =>
      prec.left(
        PREC.comparative,
        seq(
          field("expression", $._expression),
          optional(kw("NOT")),
          kw("BETWEEN"),
          optional(kw("SYMMETRIC")),
          field("lower_bound", $._expression),
          kw("AND"),
          field("upper_bound", $._expression),
        ),
      ),

    boolean_expression: $ =>
      choice(
        prec.left(PREC.unary, seq(kw("NOT"), field("argument",$._expression))),
        prec.left(PREC.and, seq(field("left", $._expression), kw("AND"), field("right", $._expression))),
        prec.left(PREC.or, seq(field("left", $._expression), kw("OR"), field("right", $._expression))),
      ),
    at_time_zone_expression: $ =>
      prec.left(
        PREC.primary,
        seq($._expression, kw("AT TIME ZONE"), $._expression),
      ),
    NULL: $ => token.immediate(kw("NULL")),
    TRUE: $ => tok("TRUE"),
    FALSE: $ => tok("FALSE"),
    UNKNOWN: $ => tok("UNKNOWN"),

    number: $ => {
      const digits = repeat1(/[0-9]+_?/);
      const exponent = seq(/[eE][\+-]?/, digits);

      return token(
        seq(
          choice(
            seq(digits, ".", optional(digits), optional(exponent)),
            seq(optional(digits), ".", digits, optional(exponent)),
            seq(digits, exponent),
            seq(digits),
          ),
        ),
      );
    },

    _unquoted_identifier: $ => /[a-zA-Z0-9_]+/,
    
    _quoted_identifier: $ =>
      token(choice(
        seq("`", field("name", /[^`]*/), "`"), // MySQL style quoting
        seq('"', repeat(choice(
          token.immediate(prec(1, /[^\\"\n]+/)),  // 普通字符
          seq('\\', '"'),                          // 转义的双引号
          '""'
        )), '"'), // ANSI QUOTES
    )),
    identifier: $ => choice($._unquoted_identifier, $._quoted_identifier),
    dotted_name: $ => prec.left(PREC.primary, sep2($.identifier, ".")),
    _identifier: $ => prec(PREC.primary, choice($.identifier, $.dotted_name)),
    string: $ => choice($._single_quoted_string, $._dollar_quoted_string),
    _single_quoted_string: $ => token(seq(
      choice("'", "e'", "E'"),
      field("content", alias(/(''|[^'])*/, $.content)),
      "'"
    )),
    _dollar_quoted_string: $ => seq(
      $._dollar_quoted_string_tag,
      field("content", alias($._dollar_quoted_string_content, $.content)),
      $._dollar_quoted_string_end_tag,
    ),
    json_access: $ =>
      seq(
        $._expression,
        choice("->", "->>", tok("#>"), tok("#>>")),
        choice($.string, $.number),
      ),
    type: $ =>
      prec.right(
        seq(
          $._identifier,
          optional(kw("VARYING", 1)), // CHARACTER/BIT VARYING
          optional(kw("PRECISION", 1)), // DOUBLE PRECISION
          optional(seq("(", commaSep1($.number), ")")),
          optional(seq(choice(kw("WITH"), kw("WITHOUT")), kw("TIME ZONE"))), // TIME/TIMESTAMP (n) WITH/WITHOUT TIME ZONE
        ),
      ),
    array_type: $ =>
      prec.right(seq($._type, repeat1(seq("[", optional($.number), "]")))),
    table_type: $ => seq(kw("TABLE"), $.column_definitions),
    _type: $ => choice($.type, $.array_type, $.table_type),
    type_cast: $ =>
      seq(
        // TODO: should be moved to basic expression or something
        field("expression", choice(
          $._parenthesized_expression,
          $.string,
          $._identifier,
          $.function_call,
          $.field_selection,
          $.array_constructor,
          $.type_cast,
          $.number,
          $.conditional_expression,
          $.NULL,
          $.TRUE,
          $.FALSE,
          $.UNKNOWN,
        )),
        "::",
        field("type", $._type),
      ),

    array_constructor: $ =>
      seq(
        kw("ARRAY", 1),
        choice(
          seq("[", commaSep($._array_element), "]"),
          seq("(", $.select_statement, ")"),
        ),
      ),
    _array_element: $ => choice(
      $._expression,
      alias($._compact_array_constructor, $.array_constructor)
    ),
    _compact_array_constructor: $ =>
      seq("[", commaSep($._array_element), "]"),

    // http://stackoverflow.com/questions/13014947/regex-to-match-a-c-style-multiline-comment/36328890#36328890
    comment: $ =>
      token(
        choice(seq("--", /.*/), seq("#", /.*/), seq("/*", /[^*]*\*+([^/*][^*]*\*+)*/, "/")),
      ),
    array_element_access: $ =>
    seq(
      field("subject", choice($._identifier, $.argument_reference, $.array_element_access, $.function_call, $._parenthesized_expression)),
      choice(
        seq("[", field("subscript", $._expression), "]"),
        seq("[", field("subscript", seq(optional($._expression), ":", optional($._expression))), "]"),
      )
    ),

    row_constructor: $ => seq(kw("ROW", 1), "(", commaSep($._expression), ")"),
    composite_expression: $ =>
      seq("(", $._expression, ",", commaSep1($._expression), ")"),

    unary_expression: $ =>
      prec(
        PREC.unary,
        seq(choice(
            "+",
            "-",
            "!!", // Factorial op (Removed in Postgres >= 14)
            "~", // Bitwise not
            "@", // Absolute value
            "|/", // square root
            "||/", // cube root
          ),
          field("operand", $._expression),
        ),
      ),

    binary_expression: $ => {
      const table = [
        [PREC.exp, "^"],
        [PREC.multiplicative, choice(...multiplicative_operators)],
        [PREC.additive, choice(...additive_operators)],
        [PREC.comparative, choice(
          ...comparative_operators,
          seq(optional(kw("NOT")), choice(
            tok('LIKE'),
            tok('ILIKE'),
            tok("SIMILAR TO"),
            tok("OVERLAPS"),
          ))
        )],
      ];

      return choice(
        ...table.map(([precedence, operator]) =>
          prec.left(
            precedence,
            seq(
              field("left", $._expression),
              field("operator", operator),
              field("right", $._expression),
            ),
          ),
        ),
      );
    },

    binary_operator: $ => choice("=", "&&", "||"),
    asterisk_expression: $ => choice("*", seq($._identifier, ".*")),
    field_selection: $ => seq($._parenthesized_expression, ".", $.identifier),
    interval_expression: $ => seq(kw("INTERVAL", 1), field("value", $.string)),
    argument_reference: $ => seq("$", field("index", /\d+/)),
    _simple_expression: $ =>
      choice(
        $.interval_expression,
        $.function_call,
        $.string,
        $.json_access,
        $.TRUE,
        $.FALSE,
        $.NULL,
        $.UNKNOWN,
        $.asterisk_expression,
        $.field_selection,
        $._identifier,
        $.number,
        $.in_expression,
        $.is_expression,
        $.isnull_expression,
        $.notnull_expression,
        $.between_and_expression,
        $.boolean_expression,
        $._parenthesized_expression,
        $.type_cast,
        $.unary_expression,
        $.binary_expression,
        $.conditional_expression,
        $.array_element_access,
        $.argument_reference,
        $.select_subexpression,
        $.at_time_zone_expression,
        $.rows_from_expression,
        $.array_constructor,
        $.row_constructor,
      ),
    _expression: $ => choice($._simple_expression, $.composite_expression),


    //////////////////////////////////// PL/SQL ////////////////////////////////////

    declare_section: $ => repeat1(
      seq(choice(
        /* TODO:
         * collection_variable_decl,
         * cursor_variable_declaration,
         * record_variable_declaration
         */
        $._type_definition,
        $.constant_declaration,
        $.variable_declaration,
        $.cursor_declaration,
        $.cursor_definition,
      ), ";")
    ),

    _type_definition: $ => choice(
      /* TODO:
       * record_type_definition,
       * ref_cursor_type_definition
       */
      $.subtype_definition,
      $.collection_type_definition,
    ),
    collection_type_definition: $ => seq(
      kw("TYPE"),
      field("name", $.identifier),
      kw("IS"),
      choice(
        $.assoc_array_type_def,
        $.varray_type_def,
        $.nested_table_type_def,
      ),
     ),
    assoc_array_type_def: $ => seq(
      kw("TABLE OF"),
      field("type", $._type),
      optional($.null_constraint),
      kw("INDEX BY"),
      field("index", choice(
        $._type,
        $.type_attribute,
        $.rowtype_attribute
      )),
    ),
    varray_type_def: $ => seq(
      choice(
        kw("VARRAY"),
        seq(optional(kw("VARYING")), kw("ARRAY"))
      ),
      "(",
      field("size_limit", $.number),
      ")",
      kw("OF"),
      field("type", $._type),
      optional($.null_constraint)
    ),
    nested_table_type_def: $ => seq(
      kw("TABLE OF"),
      field("type", $._type),
      optional($.null_constraint),
    ),
    subtype_definition: $ => seq(
      kw("SUBTYPE"),
      field("name", $.identifier),
      kw("IS"),
      field("base_type", $._type),
      optional(field("constraint", choice($.range, $.character_set))),
      optional(field("constraint", $.null_constraint))
     ),
    range: $ => seq(
      kw("RANGE"),
      field("low_value", $.number),
      tok(".."),
      field("high_value", $.number)
    ),
    character_set: $ => seq(tok("CHARACTER SET"), $.identifier),

    constant_declaration: $ => seq(
      field("name", $.identifier),
      tok("CONSTANT"),
      field("datatype", choice(
        $._type,
        $.type_attribute,
        $.rowtype_attribute
      )),
      optional($.null_constraint),
      choice(kw("DEFAULT"), tok(":=")),
      field("value", $._expression),
    ),
    variable_declaration: $ => seq(
      field("name", $.identifier),
      field("datatype", choice(
        $._type,
        $.type_attribute,
        $.rowtype_attribute
      )),
      optional(seq(
        optional($.null_constraint),
        choice(kw("DEFAULT"), tok(":=")),
        field("default_value", $._expression),
      )),
    ),
    type_attribute: $ => seq(
      field("object", $._identifier),
      "%TYPE",
    ),
    rowtype_attribute: $ => seq(
      field("object", $._identifier),
      "%ROWTYPE",
    ),

    cursor_declaration: $ => seq(
      tok("CURSOR"),
      field("name", $.identifier),
      optional(seq(
        "(", commaSep1(field("parameter", $.cursor_parameter_dec)), ")"
      )),
      kw("RETURN"),
      field("return_type", choice($.rowtype_attribute, $.type_attribute)),
    ),
    cursor_definition: $ => seq(
      tok("CURSOR"),
      field("name", $.identifier),
      optional(seq(
        "(", commaSep1(field("parameter", $.cursor_parameter_dec)), ")"
      )),
      optional(seq(
        kw("RETURN"),
        field("return_type", choice($.rowtype_attribute, $.type_attribute)),
      )),
      kw("IS"),
      field("query", choice(
        $.select_statement,
        $.combining_query,
      ))
    ),
    cursor_parameter_dec: $ => seq(
      field("name", $.identifier),
      optional(kw("IN")),
      field("datatype",$._type),
      optional(seq(
        choice(kw("DEFAULT"), tok(":=")),
        field("default_value", $._expression),
      )),
    ),

    exception_handler: $ => seq(
      kw("WHEN"),
      field("exceptions", choice(
        sep1($.identifier, kw("OR")),
        alias(kw("OTHERS"), $.identifier),
      )),
      kw("THEN"),
      field("body", $._pl_sql_statements),
    ),

    /* TODO: make the last semicolon optional
     * _pl_sql_statements: $ => seq(
     *   sep1($._pl_sql_statement, ";"),
     *   optional(";"),
     * ),
     */
    _pl_sql_statements: $ => repeat1(seq($._pl_sql_statement, ";")),
    _pl_sql_statement: $ => seq(optional($.label), choice(
      $._statement,
      $.compound_statement,
      $.assignment_statement,
      $.if_statement,
      $.basic_loop_statement,
      $.function_call,
      $.exit_statement,
      $.continue_statement,
      $.while_loop_statement,
      $.for_loop_statement,
      $.goto_statement,
      alias($.NULL, $.null_statement),
      $.forall_statement,
      $.open_statement,
      $.close_statement,
      $.open_for_statement,
      $.fetch_statement,
      $.raise_statement,
    )),
    assignment_statement: $ => seq(
      field("target", choice(
        /* TODO:
         * collection target,
         * cursor target,
         * placeholder
         */
        $._identifier
      )),
      tok(":="),
      field("value", $._expression)
    ),

    if_statement: $ => seq(
      kw("IF"),
      field("condition", $._expression),
      kw("THEN"),
      field("consequence", $._pl_sql_statements),
      field("alternative", repeat($.elsif_clause)),
      field("failure", optional($.else_clause)),
      kw("END IF")
    ),
    elsif_clause: $ => seq(
      tok("ELSIF"),
      field("condition", $._expression),
      kw("THEN"),
      field("consequence", $._pl_sql_statements),
    ),
    else_clause: $ => seq(
      kw("ELSE"),
      field("consequence", $._pl_sql_statements),
    ),

    label: $ => choice(
      seq($.identifier, ':'),
      seq("<<", $.identifier, ">>")
    ),
    basic_loop_statement: $ => seq(
      tok("LOOP"),
      $._pl_sql_statements,
      kw("END LOOP"),
      optional(field("end_label", $.identifier)),
    ),
    exit_statement: $ => seq(
      tok("EXIT"),
      field("label", optional($.identifier)),
      optional(seq(kw("WHEN"), field("condition", $._expression))),
    ),
    continue_statement: $ => seq(
      tok("CONTINUE"),
      field("label", optional($.identifier)),
      optional(seq(kw("WHEN"), field("condition", $._expression))),
    ),

    while_loop_statement: $ => seq(
      tok("WHILE"),
      field("condition", $._expression),
      tok("LOOP"),
      $._pl_sql_statements,
      kw("END LOOP"),
      optional(field("end_label", $.identifier)),
    ),

    for_loop_statement: $ => seq(
      tok("FOR"),
      field("iterator", $.iterator),
      tok("LOOP"),
      $._pl_sql_statements,
      kw("END LOOP"),
      optional(field("end_label", $.identifier)),
    ),
    iterator: $ => seq(
      field("iterand", $.iterand_decl),
      optional(seq(",", field("iterand", $.iterand_decl))),
      kw('IN'),
      commaSep1(field("control", $.qual_iteration_ctl)),
    ),
    iterand_decl: $ => seq(
      field("name", $.identifier),
      optional(choice(
        tok("MUTABLE"),
        kw("IMMUTABLE")
      )),
      optional(field("type", $._type))
    ),
    qual_iteration_ctl: $ => seq(
      optional(tok("REVERSE")),
      $._iteration_control,
      optional(seq(kw("WHILE"), $._expression)),
      optional(seq(kw("WHEN"), $._expression))
    ),
    _iteration_control: $ => choice(
      $.stepped_control,
      $.single_expression_control,
      $.values_of_control,
      $.pairs_of_control,
      $.indices_of_control,
      $.cursor_iteration_control,
    ),
    stepped_control: $ => seq(
      field("low_bound", $._expression),
      tok(".."),
      field("high_bound", $._expression),
      optional(seq(kw("BY"), field("step", $.number)))
    ),
    single_expression_control: $ => seq(
      optional(kw("REPEAT")),
      $._expression,
    ),
    values_of_control: $ => seq(
      tok("VALUES OF"),
      $._ctl_expr
    ),
    pairs_of_control: $ => seq(
      tok("PAIRS OF"),
      $._ctl_expr
    ),
    indices_of_control: $ => seq(
      tok("INDICES OF"),
      $._ctl_expr,
      optional(seq(
        kw("BETWEEN"),
        field("low_bound", $._expression),
        kw("AND"),
        field("high_bound", $._expression),
      ))
    ),
    _ctl_expr: $ => choice(
      $._expression,
      seq("(", $._statement, ")")
    ),
    cursor_iteration_control: $ => seq(
      "(",
      // $.identifier,
      $._statement,
      ")"
    ),

    forall_statement: $ => seq(
      tok("FORALL"),
      field("index", $.identifier),
      kw("IN"),
      field("bounds", alias(choice(
        $.stepped_control,
        $.indices_of_control,
        $.values_of_control
      ), $.bounds_clause)),
      optional(kw("SAVE EXCEPTIONS")),
      field("statement", $._statement),
    ),

    goto_statement: $ => seq(tok("GOTO"), field("label", $.identifier)),

    open_statement: $ => seq(
      tok("OPEN"),
      field("cursor", $.identifier),
      "(", commaSep1(field("arguments", choice($._expression, $.named_argument))), ")"
    ),
    close_statement: $ => seq(tok("CLOSE"), field("cursor", $.identifier)),
    open_for_statement: $ => seq(
      tok("OPEN"),
      field("cursor", $.identifier),
      kw("FOR"),
      field("query", choice(
        $.select_statement,
        $.combining_query,
        $.identifier,
        $.string,
      )),
      optional($.bind_variables)
    ),
    bind_variables: $ => seq(kw("USING"), commaSep(seq(optional("IN"), optional("OUT"), $._expression))),

    into_clause: $ => seq(kw("INTO"), commaSep1($.identifier)),
    bulk_collect_into_clause: $ => seq(tok("BULK"), kw("COLLECT"), kw("INTO"), commaSep1($.identifier)),
    returning_into_clause: $ => seq(
      choice(
        // TODO: kw("RETURN"),
        kw("RETURNING")
      ),
      commaSep(field("columns", $._identifier)),
      field("into", choice($.into_clause, $.bulk_collect_into_clause))
    ),
    _returning_clause: $ => choice($.returning_clause, $.returning_into_clause),
    fetch_statement: $ => seq(
      kw("FETCH"),
      field("cursor", $.identifier),
      field("into", choice(
        $.into_clause,
        seq($.bulk_collect_into_clause, optional($.limit_clause))
      ))
    ),

    raise_statement: $ => seq(tok("RAISE"), optional(field("exception", $.identifier))),

  },
});

function commaSep1(rule) {
  return sep1(rule, ",");
}

function commaSep(rule) {
  return optional(sep1(rule, ","));
}

function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}

function sep2(rule, separator) {
  return seq(rule, repeat1(seq(separator, rule)));
}

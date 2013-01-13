
// Top level namespace
var JSQ = JSQ || {};

// Namespace for functions dealing with parsing SQL
JSQ.parser = {};

// Namespace for functions dealing with generating HTML response
JSQ.generator = {};

with (JSQ) {

    // strip the string of tags, spaces, tabs and newlines
    parser.sanitize = function(sql) {

        return $.string(sql)
            .strip()
            .stripTags()
            .stripScripts()
            .gsub("\r", "")
            .gsub("\n", " ")
            .gsub("\t", "")
            .str
    }

    parser.startwords = new Array( "select", "insert", "update", "delete", "create", "drop");
    parser.stopwords = new Array("from", "where", "set");
    parser.logicwords = new Array("and", "or");
    parser.symbols = new Array("=", "<", ">", "<>", "<=", ">=");

    parser.flush = function () {

        parser.tokens = new Object();
        // select has array of children, each child is a column
        parser.tokens.select = new Object();
        parser.tokens.select.exists = false;
        parser.tokens.select.full = false;
        parser.tokens.select.children = new Array();

        // from holds the name of the table
        parser.tokens.from = new Object();
        parser.tokens.from.exists = false;
        parser.tokens.from.full = false;

        // where has an array of children, - they are and + or
        parser.tokens.where = new Object();
        parser.tokens.where.exists = false;
        parser.tokens.where.children = new Array();
        parser.tokens.where.children[0] = new Object();
        parser.tokens.where.children[0].full = false;
    }


    parser.parse = function(sql_in) {

        // flush previous tokens
        parser.flush();

        // splitting the string on spaces to create token array
        var sql = parser.sanitize(sql_in).split(" ");

        // check if the first token is a start word
        if(jQuery.inArray(sql[0].toLowerCase(), parser.startwords) == -1)
            throw "Illegal start of SQL expression: " + sql[0];
        

        for(i in sql)
        {
            word = sql[i];
            tokens = parser.tokens;

            // lets try to identify SELECT keyword first
            if(word.toLowerCase() == "select" && !tokens.from.exists && !tokens.where.exists)
            {
                if(tokens.select.exists)
                    throw "Duplicate SELECT statement found";
                else
                    tokens.select.exists = true;
            }

            
            // matches column names only when from and where keywords were not found yet		
            if(tokens.select.exists && !tokens.from.exists && !tokens.where.exists)
            {
                if(parser.isNotSpecialWord(word))
                {
                    if(!tokens.select.full)
                    {
                        // this chunk of code ensures that the columns are
                        // comma separated as needed
                        if($.string(word).endsWith(","))
                            word = word.substring(0, word.length-1);
                        else // if the word doesn't end in "," it must be the last one
                            tokens.select.full = true; 
                    
                        tokens.select.children[tokens.select.children.length] = word;
                    }
                    else
                        throw "Expected FROM; Found " + word;
                }
                
            }

            if(tokens.select.exists && word.toLowerCase() == "from")
            {
                if(tokens.where.exists)
                    throw "FROM cannot appear before WHERE";

                if(tokens.from.exists)
                    throw "Duplicate FROM statement found"
                else
                    tokens.from.exists = true;
            }

            if(tokens.select.exists && tokens.from.exists && !tokens.where.exists)
            {
                if(parser.isNotSpecialWord(word))
                {
                    if($.string(word).endsWith(",") || tokens.from.full)
                            throw "This took does not support joins. Specify single table";

                    if(parser.tableExists(word))
                    {
                        
                        tokens.from.name = word;
                        tokens.from.full = true;

                        // we know the table name now, let's try to make sure
                        // that the columns from select statement exist
                        if(tokens.select.exists && tokens.select.full)
                        {
                            for(i in tokens.select.children)
                            {
                                col = tokens.select.children[i];

                                if(!parser.columnExistsInTable(col, word))
                                    throw "Column " + col + " does not exist in table " + word;
                            }
                        }

                    }
                    else
                        throw "Table " + word + " does not exist";
                }
            }

            if(word.toLowerCase() == "where")
            {
                if(tokens.where.exists)
                    throw "Duplicate WHERE found";

                if(!tokens.from.exists)
                    throw "WHERE must appear after FROM"
                
                tokens.where.exists = true;
            }

            // now the fun part - parsing the conditional statements
            if(tokens.select.exists && tokens.from.exists && tokens.where.exists)
            {
                current_len = tokens.where.children.length-1;
                current = tokens.where.children[current_len];

                // if you see a logical operator, its time to start a new child
                if(parser.isLogic(word))
                {
                    // if current child is not full, something is wrong
                    if(!current.full)
                        throw "Unexpected use of " + word;
                    
                    tokens.where.children[tokens.where.children.length] = 	{
                                                    "full" : false, 
                                                    "logic" : word
                                                };
                    current_len = tokens.where.children.length-1;
                    current = tokens.where.children[current_len];
                }

                if(parser.isNotSpecialWord(word))
                {
                    // if the first slot is empty fill it
                    if(current.first == null)
                        current.first = word;
                    else if(current.second == null)
                    {
                        // if the first slot is full, the action slot should already be
                        // filled - otherwise we have two literals next to each other
                        if(current.action == null)
                            throw "Missing logical comparison symbol near " + word;
                        else
                        {

                            current.second = word;
                            // we found a second word - this means we are done
                            current.full = true;
                        }
                    }
                    else
                        throw "Found logical comparison symbol out of place near " + word;
                }
                else 
                {
                    if(parser.isASymbol(word))
                    {
                        if(current.first != null && current.second == null )
                                current.action = word;
                        else
                            throw "Found logical comparison symbol " + word + " out of place";
                    }
                }

            }

        }

        // let's do some validation
        
        if(tokens.select.exists && !tokens.select.full)
            throw "Incomplete select statement";

        if(tokens.from.exists && !tokens.from.full)
            throw "Incomplete FROM statement";

    }

    parser.tableExists = function (name) {

        //if(jQuery.inArray(name.toLowerCase(), tables) != -1) return true; else return false;
        
        if(tables[name] != null) return true; else false;
    }

    parser.columnExistsInTable = function (column_name, table_name) {
        if(tables[table_name][0][column_name] != null) return true; else return false;
    }

    parser.isNotSpecialWord = function(word) {

            if(	jQuery.inArray(word.toLowerCase(), parser.startwords) == -1 &&
                jQuery.inArray(word.toLowerCase(), parser.stopwords) == -1 &&
                jQuery.inArray(word.toLowerCase(), parser.logicwords) == -1 &&
                jQuery.inArray(word.toLowerCase(), parser.symbols) == -1)
                    return true;
            else
                    return false;

    }

    parser.isASymbol = function (word) {
        if (jQuery.inArray(word, parser.symbols) != -1)
            return true;
        else
            return false;
    }

    parser.isLogic = function (word) {
        if (jQuery.inArray(word, parser.logicwords) != -1)
            return true;
        else
            return false;
    }


    parser.generateCondFunction = function (conditions) {
            
        var tmp = "cond = function(row) { if(";

        for(i in conditions)
        {
            current = conditions[i];

            if(!current.full)
                throw "Incomplete WHERE statement";

            if(current.action == "<>")
                action = "!=";
            else if(current.action == "=")
                action = "==";
            else
                action = current.action;

            if(current.logic != null)
            {
                if(current.logic == "and")
                    tmp += " && ";
                else 
                    tmp += " || ";
            }

            tmp += " row[\"" + current.first + "\"] " + action + " " + current.second;
        }

        tmp += ") return true; else return false; };";

        tmp2 = "a = function(row) { if( row[\"foo\"] > 2) return true; else return false; }"

        eval(tmp);

        return cond;

    }


    // ################
    // ################ GENERATOR 
    // ################


    // Generates html for displaying tables based on the input
    generator.getTableAsString = function(table_name, cols_array, condition_function) {

        var tabl = tables[table_name];

        var out = "<table border='1'>\n<tr>\n";

        for(colnum in cols_array)
        {
            out += "\t<th>" + cols_array[colnum] + "</th>\n";
        }

        out += "</tr>\n";

        for(rownum in tabl)
        {
            out += "<tr>\n";

            row = tabl[rownum];

            for(colnum in cols_array)
            {
                if(condition_function(row))
                {
                    col = cols_array[colnum];
                    out += "\t<td>" + row[col] + "</td>\n";
                }
            }

            out += "</tr>\n";
        }

        out += "</table>";

        return out;
    }

} // end with JSQ


/**
 * Takes a SQL query and a URL to a JSON file containing the mock database,
 * parses the SQL and calls the callback function with HTML formatted table 
 * of results or error message.
 *
 * @param sql SQL query
 * @param database_url An address of a JSON file containing the DB
 * @param callback Callback function which gets called with results
 *
 */
JSQ.parse = function (sql, database_url, callback)
{
    $.getJSON(database_url, function(data) {

		tables = data;
		sql = JSQ.parser.sanitize(sql);

		try
		{
			JSQ.parser.parse(sql);
	
			if(JSQ.parser.tokens.where.exists)
				cond = JSQ.parser.generateCondFunction(tokens.where.children);
			else
				cond = function (obj) {return true};
		
			var html = JSQ.generator.getTableAsString(	JSQ.parser.tokens.from.name,
								JSQ.parser.tokens.select.children, cond);

			callback("<strong>Table: " + JSQ.parser.tokens.from.name + "</strong><br />" + html);
		}
		catch(parse_error)
		{
			callback("<span style='color:red;'><strong>SQL Error:</strong> " + parse_error + "</span>");
		}
    });
}
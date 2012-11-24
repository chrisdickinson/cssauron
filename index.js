module.exports = language

function language(lookups) {
  return function(selector) {
    return parse(selector, remap(lookups))
  }
}

function remap(opts) {
  for(var key in opts) if(opts.hasOwnProperty(key) && typeof opts[key] === 'string') {
    opts[key] = Function('return function(node, attr) { return node.'+opts[key]+' }')()
  }

  return opts
}

function parse(selector, options) {
  var bits = selector.split(/([\s>~+]+)/)
    , attr = null
    , connectors = [entry]
    , validators = []
    , lhs = []
    , rhs = null

  for(var i = 0, len = bits.length; i < len; ++i) {
    rhs = bits[i]
    if(attr) {
      lhs[lhs.length - 1] += rhs
      if(rhs.indexOf(']') > -1) {
        attr = false
      }
      continue
    }

    if(rhs === ' ' && lhs[lhs.length - 1] === '') {
      continue
    }


    if(rhs.indexOf('[') > -1) {
      if(rhs.charAt(0) === ' ' && lhs[lhs.length - 1] !== '') {
        lhs.push('')
      }
      lhs.push(rhs.replace(/^\s+/g, ''))
      attr = rhs.indexOf(']') === -1
    } else {
      lhs.push(rhs.replace(/(^\s+|\s+$)/g, ''))
    }
  }

  for(var i = lhs.length - 1; i > -1; --i) {
    if(i % 2 === 0) validators.push(parse_validator(lhs[i]))
    else connectors.push(parse_connector(lhs[i]))
  }

  return function(item) {
    for(var i = 0, len = connectors.length; i < len; ++i) {
      item = connectors[i](item, validators[i] || function() { return true })
      if(!item) return false
    }

    return true
  }

  function parse_validator(bit) {
    var sub_bits = bit.split(/([\[\.#:"'\]\*])+/)
      , subvalidators = []
      , match

    for(var i = 0, len = sub_bits.length; i < len; ++i) switch(sub_bits[i].charAt(0)) {
      case '': break
      case '*': subvalidators.push(function(n) { return !!n }); break
      case '#': subvalidators.push(valid(options.id, sub_bits[++i])); break
      case '.': subvalidators.push(valid(options.class, sub_bits[++i])); break
      default:  subvalidators.push(valid(options.tag, sub_bits[i])); break
      case ':': subvalidators.push(valid_pseudo(options, sub_bits[++i])); break
      case '[': 
        match = ''
        for(var j = i + 1; j < len && sub_bits[j] !== ']'; ++j) {
          match += sub_bits[j]
        }

        i = j + 1
        subvalidators.push(valid_attr(options.attr, match));
      break
    }

    return subvalidators.length === 1 ? subvalidators[0] : function(node) {
      var i = 0
        , okay = true

      while(okay && subvalidators[i]) {
        okay = okay && subvalidators[i++](node)
      }

      return okay
    }
  }

  function parse_connector(bit) {
    switch(bit) {
      case '': return any_parents
      case '>': return direct_parent
      case '+': return direct_sibling
      case '~': return any_sibling
    }
  }

  function any_parents(node, next) {
    do { 
      node = options.parent(node)
    } while(node && !next(node))

    return node
  }

  function direct_parent(node, next) {
    node = options.parent(node)
    return node && next(node) ? node : null
  }

  function direct_sibling(node, next) {
    var parent = options.parent(node)
      , children = options.children(parent)
      , idx = 0

    for(var i = 0, len = children.length; i < len; ++i) {
      if(children[i] === node) {
        idx = i
        break
      }
    }

    return children[idx - 1] && next(children[idx - 1]) ? children[idx - 1] : null
  }

  function any_sibling(node, next) {
    var parent = options.parent(node)
      , children = options.children(parent)

    for(var i = 0, len = children.length; i < len; ++i) {
      if(children[i] === node) return null
      if(next(children[i])) return children[i]
    }

    return null
  }
}

function entry(node, next) {
  return next(node) ? node : null
}

function valid(fn, match) {
  return function(node) {
    return (fn(node) || '').toLowerCase().split(/\s+/).indexOf(match.toLowerCase()) > -1
  }
}

function valid_pseudo(options, match) {
  switch(match) {
    case 'empty': return valid_empty(options)
    case 'first-child': return valid_first_child(options)
    case 'last-child': return valid_last_child(options)
    case 'root': return valid_root(options)
  }

  if(match.indexOf('contains') !== 0) {
    return function() { return false }
  }

  return valid_contains(options, match.slice(9, -1))
}

function valid_attr(fn, match) {
  var bits = match.split(/([\*\$~^\|]{1})?=/)
    , check = checkattr[bits[1]] || function(l, r) { return l === r }

  if(bits.length > 2) bits[2] = bits.slice(2).join('')
  if(/^['"]{1}.*['"]{1}$/.test(bits[2])) bits[2] = bits[2].slice(1, -1)

  return bits.length > 1 ? function(node) {
    return check(fn(node, bits[0]), bits[2])
  } : function(node) {
    return !!fn(node, bits[0])
  }
}

function valid_first_child(options) {
  return function(node) {
    return options.children(options.parent(node))[0] === node
  }
}

function valid_last_child(options) {
  return function(node) {
    var children = options.children(options.parent(node))
    return children[children.length - 1] === node
  }
}

function valid_empty(options) {
  return function(node) {
    return options.children(node).length === 0
  }
}

function valid_root(options) {
  return function(node) {
    return !options.parent(node)
  }
}

function valid_contains(options, contents) {
  return function(node) {
    return options.contents(node).indexOf(contents) !== -1
  }
}

var checkattr = {
  '$': function(l, r) { return l.slice(l.length - r.length) === r }
, '^': function(l, r) { return l.slice(0, r.length) === r }
, '*': function(l, r) { return l.indexOf(r) > -1 }
, '~': function(l, r) { return l.split(/\s+/).indexOf(r) > -1 }
, '|': function(l, r) { return l.split('-').indexOf(r) > -1 }
}

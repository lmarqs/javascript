import reduce from "lodash/reduce";
import sortBy from "lodash/sortBy";
import { EditorState, Modifier, SelectionState, ContentState } from "draft-js";
import wordBoundaries from "yoastseo/js/config/wordBoundaries";

const CIRCUMFIX = "%%";

const ENTITY_FORMAT = /%%([A-Za-z0-9_]+)%%/g;
const ENTITY_TYPE = "%mention";
const ENTITY_MUTABILITY = "IMMUTABLE";

/**
 * Serializes a replacement variable into a string.
 *
 * @param {string} name The name of the replacement variable.
 *
 * @returns {string} Serialized replacement variable.
 */
export function serializeVariable( name ) {
	return CIRCUMFIX + name + CIRCUMFIX;
}

/**
 * Serializes a Draft.js block into a string.
 *
 * @param {Object} entityMap Contains all the entities in the Draft.js editor.
 * @param {Object} block The block to serialize.
 *
 * @returns {string} The serialized block.
 */
export function serializeBlock( entityMap, block ) {
	const { text, entityRanges } = block;
	let previousEntityEnd = 0;

	// Ensure the entityRanges are in order from low to high offset.
	const sortedEntityRanges = sortBy( entityRanges, "offset" );
	let serialized = reduce( sortedEntityRanges, ( serialized, entityRange ) => {
		const { key, length, offset } = entityRange;
		const beforeEntityLength = offset - previousEntityEnd;

		const beforeEntity = text.substr( previousEntityEnd, beforeEntityLength );
		const serializedEntity = serializeVariable( entityMap[ key ].data.mention.name );

		previousEntityEnd = offset + length;

		return serialized + beforeEntity + serializedEntity;
	}, "" );

	serialized += text.substr( previousEntityEnd );

	return serialized;
}

/**
 * Serializes the content inside a Draft.js editor.
 *
 * @param {Object} rawContent The content as returned by convertToRaw.
 *
 * @returns {string} The serialized content.
 */
export function serializeEditor( rawContent ) {
	const { blocks, entityMap } = rawContent;

	// Every line is a block. Join the lines with a space between them.
	return blocks.map( block => serializeBlock( entityMap, block ) ).join( " " );
}

/**
 * Determines the variable label for a given variable name.
 *
 * @param {Array} replacementVariables All the available replacment variables.
 * @param {string} name The name to find the label for.
 *
 * @returns {string} The label for this replacement variable.
 */
export function getReplacementVariableLabel( replacementVariables, name ) {
	let label = name;

	replacementVariables.forEach( ( replacementVariable ) => {
		if ( replacementVariable.name === name && replacementVariable.label ) {
			label = replacementVariable.label;
		}
	} );

	return label;
}

/**
 * Finds replacement variables in a piece of content.
 *
 * Returns an array with all strings that match `%%replacement_variable%%`.
 *
 * @param {string} content The content to find replacement variables in.
 *
 * @returns {Array} The found variables and their positions.
 */
export function findReplacementVariables( content ) {
	const variables = [];
	let replacementVariable;

	while ( ( replacementVariable = ENTITY_FORMAT.exec( content ) ) ) {
		const [ match, name ] = replacementVariable;

		variables.push( {
			name,
			start: replacementVariable.index,
			length: match.length,
		} );
	}

	return variables;
}

/**
 * Adds a human-readable label to a variable.
 *
 * @param {Object} variable Details about the variable we are replacing.
 * @param {Array} replacementVariables All the available replacement variables.
 *
 * @returns {Object} The variable with its label.
 */
export function addLabel( variable, replacementVariables ) {
	return {
		...variable,
		label: getReplacementVariableLabel( replacementVariables, variable.name ),
	};
}

/**
 * Adds position information about a variable inside a block.
 *
 * @param {Object} variable Details about the variable we are replacing.
 *
 * @returns {Object} The variable with position information.
 */
export function addPositionInformation( variable ) {
	return {
		...variable,
		start: variable.start,
		end: variable.start + variable.length,
		delta: variable.label.length - variable.length,
	};
}

/**
 * Changes a selection object to represent the selection after replacement.
 *
 * @param {SelectionState} selection The previous selection state.
 * @param {string} blockKey The key of the block we are working in.
 * @param {Object} variable Details about the variable we are replacing.
 *
 * @returns {SelectionState} The new selection state.
 */
export function moveSelectionAfterReplacement( selection, blockKey, variable ) {
	const { start, end, delta } = variable;

	/*
	 * If the selection touches the replacement we are doing, we always move the
	 * cursor to the end of the entity once it has been replaced.
	 */
	if ( selection.hasEdgeWithin( blockKey, start, end ) ) {
		const newEnd = end + delta;

		selection = selection.merge( {
			anchorOffset: newEnd,
			focusOffset: newEnd,
		} );

	/*
	 * If the selection is after the thing we are replacing, we need to move the
	 * selection the same amount.
	 */
	} else if ( selection.focusOffset > end ) {
		selection = selection.merge( {
			anchorOffset: selection.anchorOffset + delta,
			focusOffset: selection.focusOffset + delta,
		} );
	}

	return selection;
}

/**
 * Creates a DraftJS entity in a content state.
 *
 * @param {ContentState} contentState The previous content state.
 * @param {Object} variable Details about the variable we are replacing.
 *
 * @returns {ContentState} The new content state.
 */
export function createEntityInContent( contentState, variable ) {
	const entityData = {
		mention: {
			name: variable.name,
		},
	};

	return contentState.createEntity( ENTITY_TYPE, ENTITY_MUTABILITY, entityData );
}

/**
 * Replaces a replacement variable in the editor with an entity representing it.
 *
 * @param {EditorState} editorState The previous editor state.
 * @param {Object} variable Details about the variable we are replacing.
 * @param {string} blockKey The key of the block we are working in.
 *
 * @returns {EditorState} The new editor state.
 */
export function replaceVariableWithEntity( editorState, variable, blockKey ) {
	let contentState = editorState.getCurrentContent();

	// Create a selection that spans the `%%replacement_variable%%` in the text.
	const variableTextSelection = SelectionState.createEmpty( blockKey )
		.merge( {
			anchorOffset: variable.start,
			focusOffset: variable.end,
		} );

	// We need to create the entity before replacing text with it.
	contentState = createEntityInContent( contentState, variable );

	/*
	 * Do the actual replacement.
	 *
	 * We replace `%%replacement_variable%%` with an entity. The entity is already
	 * created in the content state. So we can refer to it by using
	 * `contentState.getLastCreatedEntityKey`.
	 */
	const newContentState = Modifier.replaceText(
		contentState,
		variableTextSelection,
		variable.label,
		// No inline style needed.
		null,
		contentState.getLastCreatedEntityKey(),
	);

	// We need to apply the new content state to the editor state.
	return EditorState.push( editorState, newContentState, "apply-entity" );
}

/**
 * Gets the selected text.
 *
 * @param {EditorState} editorState The editor state to find the selected text in.
 * @param {SelectionState} SelectionState The selection state to find the text for.
 *
 * @returns {string} The selected text.
 */
export function getSelectedText( editorState, SelectionState ) {
	const anchorKey = SelectionState.getAnchorKey();
	const currentContent = editorState.getCurrentContent();
	const currentBlock = currentContent.getBlockForKey( anchorKey );
	const start = SelectionState.getStartOffset();
	const end = SelectionState.getEndOffset();

	return currentBlock.getText().slice( start, end );
}

/**
 * Adds a space after a replacement variable if there isn't one now.
 *
 * Takes into account word boundaries so we don't add spaces before comma's,
 * full stops or other punctuation.
 *
 * @param {EditorState} editorState The current editor state.
 * @param {SelectionState} selection The current selection state.
 * @param {string} blockKey Key of the block we are currently working with.
 * @param {Object} variable Details about the variable we are replacing.
 * @returns {{editorState: EditorState, selection: SelectionState}} New editor and selection state.
 */
function addSpaceAfterVariable( editorState, selection, blockKey, variable ) {
	const contentState = editorState.getCurrentContent();

	/*
	 * We need to know what is the first character after the replacement variable to
	 * decide whether we need to insert a space after the variable (see below).
	 */
	const selectionCharacterAfterVariable = SelectionState.createEmpty( blockKey ).merge( {
		anchorOffset: variable.end,
		focusOffset: variable.end + 1,
	} );

	const characterAfterVariable = getSelectedText( editorState, selectionCharacterAfterVariable );

	/*
	 * We're making sure there is a space after every entity to improve the UX.
	 * Without a space, replaced variables are stuck to each other, while it might
	 * look like they aren't when looking at the entities because of the margin
	 * between entities.
	 */
	if ( ! wordBoundaries().includes( characterAfterVariable ) ) {
		// We want to place a space after the variable, so we need to know where that is.
		const selectionAfterVariable = SelectionState.createEmpty( blockKey ).merge( {
			anchorOffset: variable.end,
			focusOffset: variable.end,
		} );

		const newContentState = Modifier.insertText(
			contentState,
			selectionAfterVariable,
			" ",
		);
		editorState = EditorState.push( editorState, newContentState, "insert-characters" );

		if ( selection.getAnchorOffset() >= variable.start ) {
			selection = selection.merge( {
				anchorOffset: selection.getAnchorOffset() + 1,
				focusOffset: selection.getFocusOffset() + 1,
			} );
		}
	}

	return { editorState, selection };
}

/**
 * Replaces replacement variables (%%replacement_variable%%) in an editor state with entities.
 *
 * @param {EditorState} editorState The editor state to find the variables in.
 * @param {Array}       replacementVariables The available replacement variables, used
 *                                           to determine the label in the entities.
 *
 * @returns {EditorState} The new editor state with entities.
 */
export function replaceReplacementVariables( editorState, replacementVariables ) {
	const contentState = editorState.getCurrentContent();
	const blockMap = contentState.getBlockMap();
	let newEditorState = editorState;

	/*
	 * Because we do this for each block our code will work for multiple blocks even if
	 * we currently usually only have one block.
	 */
	blockMap.forEach( ( block ) => {
		const { text, key: blockKey } = block;
		const foundReplacementVariables = findReplacementVariables( text );

		/*
		 * We reverse the order to make it possible to replace replace vars without
		 * having to keep track of the difference between the entity length and the
		 * length before replacement.
		 */
		[ ...foundReplacementVariables ].reverse().forEach( ( variable ) => {
			variable = addLabel( variable, replacementVariables );
			variable = addPositionInformation( variable );

			let selection = newEditorState.getSelection();
			selection = moveSelectionAfterReplacement( selection, blockKey, variable );

			const addedSpace = addSpaceAfterVariable( newEditorState, selection, blockKey, variable );

			newEditorState = replaceVariableWithEntity( addedSpace.editorState, variable, blockKey );
			newEditorState = EditorState.acceptSelection( newEditorState, addedSpace.selection );
		} );
	} );

	return newEditorState;
}

/**
 * Unserializes a piece of content into Draft.js data.
 *
 * @param {string} content The content to unserialize.
 * @param {Array} replacementVariables The replacement variables for the Draft.js mention plugin.
 *
 * @returns {EditorState} The raw data ready for convertFromRaw.
 */
export function unserializeEditor( content, replacementVariables ) {
	const editorState = EditorState.createWithContent( ContentState.createFromText( content ) );

	return replaceReplacementVariables( editorState, replacementVariables );
}

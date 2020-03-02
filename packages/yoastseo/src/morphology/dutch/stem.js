import { checkIfWordEndingIsOnExceptionList } from "../morphoHelpers/exceptionListHelpers";
import { removeSuffixFromFullForm } from "../morphoHelpers/stemHelpers";
import { isVowelDoublingAllowed } from "./stemModificationHelpers";
import { generateCorrectStemWithTAndDEnding } from "./getStemWordsWithTAndDEnding.js";
import { flatten } from "lodash-es";

/**
 * @file Dutch stemming algorithm. Adapted from:
 * @author:
 * @copyright
 * All rights reserved.
 * Implementation of the stemming algorithm from http://snowball.tartarus.org/algorithms/dutch/stemmer.html
 * Copyright of the algorithm is: Copyright (c) 2001, Dr Martin Porter and can be found at http://snowball.tartarus.org/license.php
 *
 * Redistribution and use in source and binary forms, with or without modification, is covered by the standard BSD license.
 */

/**
 * Determines the start index of the R1 region.
 * R1 is the region after the first non-vowel following a vowel. It should include at least 3 letters.
 *
 * @param {string} word The word for which to determine the R1 region.
 * @returns {number} The start index of the R1 region.
 */
const determineR1 = function( word ) {
	// Start with matching the first cluster that consists of a vowel and a non-vowel.
	let r1Index = word.search( /[aeiouyèäüëïöáéíóú][^aeiouyèäüëïöáéíóú]/ );
	// Then add 2 since the R1 index is the index after the first vowel & non-vowel matched with the regex.
	if ( r1Index !== -1 ) {
		r1Index += 2;
	}

	// Adjust R1 so that the region preceding it includes at least 3 letters.
	if ( r1Index !== -1 && r1Index < 3 ) {
		r1Index = 3;
	}

	return r1Index;
};

/**
 * Searches for suffixes in a word.
 *
 * @param {string} word 	The word in which to look for suffixes.
 * @param {Object} suffixStep	 One of the three steps of findings suffixes.
 * @param {number} r1Index	 The index of the R1 region.
 * @returns {Object} The index of the suffix and extra information about whether, and how, the stem will need to be modified.
 */
const findSuffix = function( word, suffixStep, r1Index ) {
	for ( const suffixClass in suffixStep ) {
		if ( suffixStep.hasOwnProperty( suffixClass ) ) {
			const suffixes = suffixStep[ suffixClass ].suffixes;

			const matchedRegex = suffixes.find( suffixRegex => new RegExp( suffixRegex ).exec( word ) );

			if ( matchedRegex ) {
				const matched = new RegExp( matchedRegex ).exec( word );
				const suffix = matched[ matched.length - 1 ];
				const suffixIndex = word.lastIndexOf( suffix );

				if ( suffixIndex >= r1Index ) {
					return {
						suffixIndex: suffixIndex,
						stemModification: suffixStep[ suffixClass ].stemModification,
					};
				}
			}
		}
	}
};

/**
 * Modifies the stem of the word according to the specified modification type.
 *
 * @param {string} word The stem that needs to be modified.
 * @param {string[]} modificationGroup The type of modification that needs to be done.
 * @returns {string} The modified stem, or the same stem if no modification was made.
 */
const modifyStem = function( word, modificationGroup ) {
	const neededReplacement = modificationGroup.find( replacement => word.search( new RegExp( replacement[ 0 ] ) ) !== -1 );
	if ( typeof neededReplacement !== "undefined" ) {
		word = word.replace( new RegExp( neededReplacement[ 0 ] ), neededReplacement[ 1 ] );
	} return word;
};

/**
 * Deletes the suffix and modifies the stem according to the required modifications.
 *
 * @param {string} word	 The word from which to delete the suffix.
 * @param {Object} suffixStep 	One of the three steps of deleting a suffix.
 * @param {number} suffixIndex	 The index of the found suffix.
 * @param {string} stemModification 	The type of stem modification that needs to be done.
 * @param {Object} morphologyDataNL	 The Dutch morphology data file.
 * @returns {string} The stemmed and modified word.
 */
const deleteSuffixAndModifyStem = function( word, suffixStep, suffixIndex, stemModification, morphologyDataNL ) {
	if ( stemModification === "hedenToHeid" ) {
		return modifyStem( word, morphologyDataNL.stemming.stemModifications.hedenToHeid );
	}
	word = word.substring( 0, suffixIndex );
	if ( stemModification === "changeIedtoId" ) {
		return modifyStem( word, morphologyDataNL.stemming.stemModifications.iedToId );
	} else if ( stemModification === "changeInktoIng" && word.endsWith( "ink" ) ) {
		return modifyStem( word, morphologyDataNL.stemming.stemModifications.inkToIng );
	} else if ( stemModification === "vowelDoubling" && isVowelDoublingAllowed( word, morphologyDataNL.stemming.stemExceptions ) ) {
		return modifyStem( word, morphologyDataNL.stemming.stemModifications.doubleVowel );
	}
	return word;
};

/**
 * Finds and deletes the suffix found in a particular step, and modifies the stem.
 *
 * @param {string} word 	The word for which to find and delete a suffix.
 * @param {Object} suffixStep	 One of the three suffix steps.
 * @param {number} r1Index	 The index of the R1 region.
 * @param {Object} morphologyDataNL	 The Dutch morphology data file.
 * @returns {string} The word with the deleted suffix.
 */
const findAndDeleteSuffix = function( word, suffixStep, r1Index, morphologyDataNL ) {
	const foundSuffix = findSuffix( word, suffixStep, r1Index );
	if ( typeof foundSuffix !== "undefined" ) {
		word = deleteSuffixAndModifyStem( word, suffixStep, foundSuffix.suffixIndex, foundSuffix.stemModification, morphologyDataNL );
	}

	return word;
};

/**
 * Runs through three stemming steps that process different kinds of suffixes, determines if there is a valid suffix
 * within the R1 region that can be deleted for stemming and deletes it, as well as applies suffix-specific stem
 * modifications if needed.
 *
 * @param {string} word 	The word for which to find and delete suffixes.
 * @param {Object} suffixSteps	 All of the suffix steps.
 * @param {number} r1Index	 The index of the R1 region
 * @param {Object} morphologyDataNL 	The Dutch morphology data file.
 * @returns {string} The word with the delete suffix.
 */
const findAndDeleteSuffixes = function( word, suffixSteps, r1Index, morphologyDataNL ) {
	for ( const suffixStep in suffixSteps ) {
		if ( suffixSteps.hasOwnProperty( suffixStep ) ) {
			word = findAndDeleteSuffix( word, suffixSteps[ suffixStep ], r1Index, morphologyDataNL );
		}
	}

	return word;
};

/**
 * Check whether the word is a comparative adjective with a stem ending in -rd. If yes, stem it (the regular stemmer
 * would incorrectly stem the d).
 * @param {string} word The word to check.
 * @param {Object} adjectivesEndingInRd The exception list of adjectives with stem ending in -rd.
 * @returns {string} The stemmed word or the original word if it was not matched with the exception list.
 */
const stemAdjectiveEndingInRd = function( word, adjectivesEndingInRd ) {
	for ( const adjective of adjectivesEndingInRd ) {
		const regex = new RegExp( adjective + "er[se]?$" );
		if ( word.search( regex ) !== -1 ) {
			if ( word.endsWith( "er" ) ) {
				return word.slice( 0, -2 );
			}
			return word.slice( 0, -3 );
		}
	} return word;
};

/**
 * Get the stem from noun diminutives and plurals exceptions.
 *
 * @param {Object[]}    exceptionsRemoveSuffixFromFullForms The data for stemming exception.
 * @param {string}      word                                The word to check.
 *
 * @returns {string} The stemmed word.
 */
const removeSuffixFromFullForms = function( exceptionsRemoveSuffixFromFullForms, word ) {
	for ( const exceptionClass of exceptionsRemoveSuffixFromFullForms ) {
		const stemmedWord = removeSuffixFromFullForm( exceptionClass.forms, exceptionClass.suffix, word );

		if ( stemmedWord ) {
			return stemmedWord;
		}
	}
};

/**
 * Stems Dutch words.
 *
 * @param {string} word  The word to stem.
 * @param {Object} morphologyDataNL The Dutch morphology data file.
 *
 * @returns {string} The stemmed word.
 */
export default function stem( word, morphologyDataNL ) {
	// Check whether the word is on an exception list of words that shouldn't be stemmed. If it is, return the word.
	const wordsNotToBeStemmed = flatten( Object.values( morphologyDataNL.stemming.stemExceptions.wordsNotToBeStemmedExceptions ) );

	if ( checkIfWordEndingIsOnExceptionList( word, wordsNotToBeStemmed ) ) {
		return word;
	}

	/*
	 * Return the word if it should not be stemmed.
	 * And return the correct stem for words which end in ambiguous endings such as -t, -te, -ten, -de, or -den.
	 */
	const tAndDStemmingCheck = generateCorrectStemWithTAndDEnding( morphologyDataNL.stemming, word );

	if ( tAndDStemmingCheck ) {
		return tAndDStemmingCheck;
	}
	/*
	 * Check whether the word is on an exception list of adjectives with stem ending in -rd. If it is, stem and
	 * return the word here, instead of going through the regular stemmer.
 	 */
	const wordAfterRdExceptionCheck = stemAdjectiveEndingInRd( word, morphologyDataNL.stemming.stemExceptions.adjectivesEndInRD );
	if ( wordAfterRdExceptionCheck !== word ) {
		return wordAfterRdExceptionCheck;
	}
	/* Checks whether the word is in the exception list of nouns with specific diminutive or plural suffixes that needs to be stemmed.
	 * If it is return the stem here.
	 */
	const stemFromFullForm = removeSuffixFromFullForms( morphologyDataNL.stemming.stemExceptions.removeSuffixFromFullForms, word );
	if ( stemFromFullForm ) {
		return stemFromFullForm;
	}

	/*
	 * Checks whether the word is in the exception list of diminutives that need to be stemmed and that additionally need
	 * to have the final vowel removed. If it is return the stem here.
	 */
	const stemFromFullFormAndDeleteFinalVowel = removeSuffixFromFullForm(
		morphologyDataNL.stemming.stemExceptions.stemTjeAndOnePrecedingVowel.forms,
		morphologyDataNL.stemming.stemExceptions.stemTjeAndOnePrecedingVowel.suffix,
		word
	);

	if ( stemFromFullFormAndDeleteFinalVowel ) {
		return stemFromFullFormAndDeleteFinalVowel.slice( 0, -1 );
	}

	/*
	 * Put i and y in between vowels, initial y, and y after a vowel into upper case. This is because they should
	 * be treated as consonants so we want to differentiate them from other i's and y's when matching regexes.
	 */
	word = modifyStem( word, morphologyDataNL.stemming.stemModifications.IAndYToUppercase );

	// Find the start index of the R1 region.
	const r1Index = determineR1( word );

	// Import the suffixes from all three steps.
	const suffixSteps = morphologyDataNL.stemming.suffixes;

	// Run through the three steps of possible de-suffixation.
	word = findAndDeleteSuffixes( word, suffixSteps, r1Index, morphologyDataNL );

	// Do final modifications to the stem.
	return modifyStem( word, morphologyDataNL.stemming.stemModifications.finalChanges );
}
/*
 * Copyright 2015 W.M. Webberley & A.D. Preece (Cardiff University)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

const CEAgent = require('./CEAgent.js');
const CEParser = require('./CEParser.js');
const QuestionParser = require('./QuestionParser.js');
const NLParser = require('./NLParser.js');
const RuleEngine = require('./RuleEngine.js');

class CENode {

  newInstanceId() {
    this.lastInstanceId += 1;
    return this.lastInstanceId;
  }
  newConceptId() {
    this.lastConceptId += 1;
    return this.lastConceptId;
  }
  newCardId() {
    if (!this.agent) {
      return null;
    }
    this.lastCardId += 1;
    return this.agent.getName() + this.lastCardId;
  }

  getConceptById(id) {
    return this.conceptDict[id];
  }

  getConceptByName(name) {
    if (!name) { return null; }
    for (let i = 0; i < this.concepts.length; i += 1) {
      if (this.concepts[i].name.toLowerCase() === name.toLowerCase()) {
        return this.concepts[i];
      }
      for (let j = 0; j < this.concepts[i].synonyms.length; j += 1) {
        if (this.concepts[i].synonyms[j].toLowerCase() === name.toLowerCase()) {
          return this.concepts[i];
        }
      }
    }
    return null;
  }

  getInstanceById(id) {
    return this.instanceDict[id];
  }

  getInstanceByName(name) {
    if (!name) { return null; }
    for (let i = 0; i < this.instances.length; i += 1) {
      if (this.instances[i].name.toLowerCase() === name.toLowerCase()) {
        return this.instances[i];
      }
      for (let j = 0; j < this.instances[i].synonyms.length; j += 1) {
        if (this.instances[i].synonyms[j].toLowerCase() === name.toLowerCase()) {
          return this.instances[i];
        }
      }
    }
    return null;
  }
  
    
  /*
   * Get the current set of instances maintained by the node.
   *
   * If conceptType and recurse NULL:
   *  - Return ALL instances
   *
   * If conceptType not NULL and recurse NULL|FALSE:
   *  - Return all instances with concept type name 'conceptType'
   *
   * If recurse TRUE:
   *  - Return all instances of concepts that are children, grandchildren, etc.
   *    of concept with name 'conceptType'
   *
   * Returns: [obj{instance}]
   */
  getInstances(conceptType, recurse) {
    let instanceList = [];
    if (!conceptType) {
      instanceList = this.instances;
    } else if (conceptType && !recurse) {
      const concept = this.getConceptByName(conceptType);
      if (concept) {
        for (let i = 0; i < this.instances.length; i += 1) {
          if (this.instances[i].type.id === concept.id) {
            instanceList.push(this.instances[i]);
          }
        }
      }
    } else if (conceptType && recurse === true) {
      const concept = this.getConceptByName(conceptType);
      if (concept) {
        const descendants = concept.descendants.concat(concept);
        const childrenIds = [];
        for (let i = 0; i < descendants.length; i += 1) { childrenIds.push(descendants[i].id); }
        for (let i = 0; i < this.instances.length; i += 1) {
          if (childrenIds.indexOf(this.instances[i].type.id) > -1) {
            instanceList.push(this.instances[i]);
          }
        }
      }
    }
    return instanceList;
  }

  /*
   * Adds a sentence to be processed by the node.
   * This method will ALWAYS return a response by dynamically
   * checking whether input is pure CE -> question -> NL.
   *
   * Returns: see signatures for addCE, askQuestion, addNL
   */
  addSentence(sentence, source) {
    const ceResult = this.addCE(sentence, false, source);
    if (ceResult.success) {
      return ceResult;
    }

    const questionResult = this.askQuestion(sentence);
    if (questionResult.success) {
      return questionResult;
    }

    return this.addNL(sentence);
  }

  /*
   * Add an array of sentences to the node.
   *
   * Returns: [[bool, str]...] (see signature for addSentence)
   */
  addSentences(sentences, source) {
    const responses = [];
    for (let i = 0; i < sentences.length; i += 1) {
      responses.push(this.addSentence(sentences[i], source));
    }
    return responses;
  }

  /*
   * Attempt to parse CE and add data to the node.
   * Indicates whether CE was successfully parsed.
   *
   * dryRun is an optional argument to perform a dry-run.
   *
   * Returns: {success: bool, type: str, data: str}
   */
  addCE(sentence, dryRun, source) {
    const success = this.ceParser.parse(sentence.trim().replace('{now}', new Date().getTime()).replace('{uid}', this.newCardId()), dryRun, source);
    return {
      success: success[0],
      type: 'gist',
      data: success[1],
      result: success[2] || undefined,
    };
  }

  /*
   * Attempt to query the node. Success is indicated.
   * Indicates success of whether a valid question was parsed
   *
   * Returns: {success: bool, type: str, data: str}
   */
  askQuestion(sentence) {
    const success = this.questionParser.parse(sentence);
    return {
      success: success[0],
      type: success[0] ? 'gist' : undefined,
      data: success[0] ? success[1] : undefined,
    };
  }

  /*
   * Attempt to parse NL without updating model.
   * Method returns a response representing a CE 'guess' of the input sentence
   *
   * Returns: {type: str, data: str}
   */
  addNL(sentence) {
    const success = this.nlParser.parse(sentence);
    return {
      type: success[0] ? 'confirm' : 'gist',
      data: success[1],
    };
  }

  /*
   * Add an array of CE sentences to the node.
   *
   * Returns: [[bool, str]...] (see signature for addCE)
   */
  loadModel(sentences) {
    const responses = [];
    for (let i = 0; i < sentences.length; i += 1) {
      responses.push(this.addCE(sentences[i]));
    }
    return responses;
  }

  /*
   * Reset store to 'factory settings' by removing all known instances
   * and concepts.
   */
  resetAll() {
    this.instances = [];
    this.concepts = [];
  }

  /*
   * Initialise and attach a new CEAgent to handle
   * cards and policies for the node.
   */
  attachAgent(agent) {
    this.agent = agent || new CEAgent(this);
  }

  /*
   * Initialise node by adding any passed models as
   * sentence sets to be processed.
   */
  constructor(...models) {
    this.ceParser = new CEParser(this);
    this.questionParser = new QuestionParser(this);
    this.nlParser = new NLParser(this);
    this.ruleEngine = new RuleEngine(this);
    this.concepts = [];
    this.instances = [];
    this.conceptDict = {};
    this.instanceDict = {};
    this.conceptIds = {};
    this.lastInstanceId = this.instances.length;
    this.lastConceptId = this.concepts.length;
    this.lastCardId = 0;
    for (let i = 0; i < models.length; i += 1) {
      this.loadModel(models[i]);
    }
  }
}
module.exports = CENode;
